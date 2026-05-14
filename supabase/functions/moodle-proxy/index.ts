import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MOODLE_BASE_URL = (Deno.env.get("MOODLE_BASE_URL") ?? "").replace(/\/$/, "");
const MOODLE_TOKEN = Deno.env.get("MOODLE_TOKEN") ?? "";
const MOODLE_TIMEOUT_MS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const READ_ONLY_FUNCTIONS = new Set([
  "core_course_get_courses_by_field",
  "core_course_search_courses",
  "core_course_get_contents",
  "core_enrol_get_enrolled_users",
  "core_user_get_users",
  "core_user_get_users_by_field",
  "core_enrol_get_users_courses",
  "gradereport_user_get_grade_items",
  "core_completion_get_activities_completion_status",
  "mod_assign_get_assignments",
  "mod_assign_get_submissions",
  "mod_assign_get_grades",
  "block_configurable_reports_get_report_data",
]);

function normalizePath(pathname: string): string {
  return pathname.replace(/^\/moodle-proxy/, "") || "/";
}

function toInt(value: string | null | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(String(value), 10);
  return isFinite(n) ? n : fallback;
}

function toBool(value: string | null | undefined, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "sim"].includes(String(value).toLowerCase());
}

function splitCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeMoodleError(data: unknown): unknown {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.exception || d.errorcode) {
      throw Object.assign(new Error(String(d.message || "Erro retornado pelo Moodle.")), { status: 502, moodle: data });
    }
  }
  return data;
}

function appendParam(body: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendParam(body, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      appendParam(body, key ? `${key}[${k}]` : k, v);
    }
    return;
  }
  body.append(key, String(value));
}

async function moodleCall(wsfunction: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!MOODLE_BASE_URL || !MOODLE_TOKEN) {
    throw Object.assign(new Error("MOODLE_BASE_URL e MOODLE_TOKEN precisam estar configurados como secrets da Edge Function."), { status: 500 });
  }
  if (!READ_ONLY_FUNCTIONS.has(wsfunction)) {
    throw Object.assign(new Error(`Função Moodle não permitida no proxy read-only: ${wsfunction}`), { status: 403 });
  }

  const body = new URLSearchParams();
  body.set("wstoken", MOODLE_TOKEN);
  body.set("wsfunction", wsfunction);
  body.set("moodlewsrestformat", "json");
  for (const [k, v] of Object.entries(params)) appendParam(body, k, v);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MOODLE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${MOODLE_BASE_URL}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") {
      throw Object.assign(new Error(`Timeout ao chamar o Moodle (>${MOODLE_TIMEOUT_MS}ms): ${wsfunction}`), { status: 504 });
    }
    throw Object.assign(new Error(`Erro de rede ao chamar o Moodle: ${e.message}`), { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    throw Object.assign(new Error("Resposta do Moodle não veio em JSON."), { status: 502, raw: text.slice(0, 2000) });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Erro HTTP do Moodle: ${response.status}`), { status: 502, moodle: data });
  }
  return normalizeMoodleError(data);
}

function okJson(source: string, data: unknown, extra: Record<string, unknown> = {}): Response {
  return jsonResp(200, { ok: true, source, data, generatedAt: new Date().toISOString(), ...extra });
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errResp(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResp(status, { ok: false, error, message, ...extra });
}

function pickStudentSummary(user: Record<string, unknown>) {
  return {
    id: user.id, username: user.username, firstname: user.firstname, lastname: user.lastname,
    fullname: user.fullname, email: user.email, idnumber: user.idnumber,
    firstaccess: user.firstaccess, lastaccess: user.lastaccess,
    lastcourseaccess: user.lastcourseaccess, roles: user.roles,
  };
}

function flattenCourseAssignments(result: unknown): Record<string, unknown>[] {
  const courses = (result as Record<string, unknown[]>)?.courses ?? [];
  return (courses as Record<string, unknown>[]).flatMap((course) =>
    ((course.assignments ?? []) as Record<string, unknown>[]).map((a) => ({
      ...a, courseid: course.id, coursefullname: course.fullname, courseshortname: course.shortname,
    }))
  );
}

function getLatestSubmissions(result: unknown): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const assignment of (result as Record<string, unknown[]>)?.assignments ?? []) {
    for (const sub of ((assignment as Record<string, unknown[]>).submissions ?? []) as Record<string, unknown>[]) {
      if (Number(sub.latest) === 0) continue;
      rows.push({ assignmentid: (assignment as Record<string, unknown>).assignmentid, ...sub });
    }
  }
  return rows;
}

function getGradeMap(result: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const assignment of (result as Record<string, unknown[]>)?.assignments ?? []) {
    const a = assignment as Record<string, unknown>;
    for (const grade of (a.grades ?? []) as Record<string, unknown>[]) {
      map.set(`${a.assignmentid}:${grade.userid}`, grade);
    }
  }
  return map;
}

async function getStudentsForCourse(courseId: number, options: {
  onlyActive?: boolean; limitFrom?: number; limitNumber?: number;
  sortBy?: string; sortDirection?: string;
} = {}): Promise<Record<string, unknown>[]> {
  const opts = [
    { name: "userfields", value: "id,username,firstname,lastname,fullname,email,idnumber,firstaccess,lastaccess,lastcourseaccess,roles" },
    { name: "limitfrom", value: String(options.limitFrom ?? 0) },
    { name: "limitnumber", value: String(options.limitNumber ?? 100) },
    { name: "sortby", value: options.sortBy ?? "lastname" },
    { name: "sortdirection", value: options.sortDirection ?? "ASC" },
  ];
  if (options.onlyActive !== undefined) {
    opts.push({ name: "onlyactive", value: options.onlyActive ? "1" : "0" });
  }
  const data = await moodleCall("core_enrol_get_enrolled_users", { courseid: courseId, options: opts });
  return (data as Record<string, unknown>[]);
}

async function getAssignmentsForCourse(courseId: number, limit = 50): Promise<Record<string, unknown>[]> {
  const result = await moodleCall("mod_assign_get_assignments", { courseids: [courseId] });
  return flattenCourseAssignments(result).slice(0, limit);
}

async function validateApiKey(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id")
    .eq("api_key", token)
    .eq("active", true)
    .maybeSingle();

  return !error && data !== null;
}

type Handler = (url: URL, params: Record<string, string>) => Promise<Response>;
interface Route { pattern: URLPattern; handler: Handler; }
const routes: Route[] = [];

function GET(path: string, handler: Handler) {
  routes.push({ pattern: new URLPattern({ pathname: path }), handler });
}

GET("/health", async () =>
  jsonResp(200, {
    ok: true, service: "moodle-consultas-readonly-proxy", readOnly: true,
    moodleBaseUrlConfigured: Boolean(MOODLE_BASE_URL),
    moodleTokenConfigured: Boolean(MOODLE_TOKEN),
  })
);

GET("/courses", async (url) => {
  const data = await moodleCall("core_course_get_courses_by_field", {
    field: url.searchParams.get("field") ?? "",
    value: url.searchParams.get("value") ?? "",
  });
  return okJson("core_course_get_courses_by_field", data);
});

GET("/courses/search", async (url) => {
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) return errResp(400, "query_required", "Informe query.");
  const data = await moodleCall("core_course_search_courses", {
    criterianame: "search", criteriavalue: query,
    page: toInt(url.searchParams.get("page"), 0),
    perpage: Math.min(toInt(url.searchParams.get("perPage"), 20)!, 100),
    limittoenrolled: toBool(url.searchParams.get("limitToEnrolled"), false) ? 1 : 0,
  });
  return okJson("core_course_search_courses", data);
});

GET("/courses/:courseId/contents", async (_, p) => {
  const data = await moodleCall("core_course_get_contents", { courseid: Number(p.courseId) });
  return okJson("core_course_get_contents", data);
});

GET("/courses/:courseId/students", async (url, p) => {
  const data = await getStudentsForCourse(Number(p.courseId), {
    onlyActive: toBool(url.searchParams.get("onlyActive"), true),
    limitFrom: toInt(url.searchParams.get("limitFrom"), 0),
    limitNumber: Math.min(toInt(url.searchParams.get("limitNumber"), 100)!, 500),
    sortBy: url.searchParams.get("sortBy") ?? "lastname",
    sortDirection: url.searchParams.get("sortDirection") ?? "ASC",
  });
  return okJson("core_enrol_get_enrolled_users", data.map(pickStudentSummary));
});

GET("/users/search", async (url) => {
  const key = (url.searchParams.get("key") ?? "").trim();
  const value = (url.searchParams.get("value") ?? "").trim();
  if (!key || !value) return errResp(400, "criteria_required", "Informe key e value.");
  const data = await moodleCall("core_user_get_users", { criteria: [{ key, value }] });
  return okJson("core_user_get_users", data);
});

GET("/users/by-field", async (url) => {
  const field = (url.searchParams.get("field") ?? "").trim();
  const values = splitCsv(url.searchParams.get("values"));
  if (!field || values.length === 0) return errResp(400, "field_values_required", "Informe field e values.");
  const data = await moodleCall("core_user_get_users_by_field", { field, values });
  return okJson("core_user_get_users_by_field", data);
});

GET("/users/:userId/courses", async (url, p) => {
  const data = await moodleCall("core_enrol_get_users_courses", {
    userid: Number(p.userId),
    returnusercount: toBool(url.searchParams.get("returnUserCount"), false) ? 1 : 0,
  });
  return okJson("core_enrol_get_users_courses", data);
});

GET("/users/:userId/last-access", async (url, p) => {
  const userId = Number(p.userId);
  const courseId = toInt(url.searchParams.get("courseId"));
  if (courseId) {
    const users = await getStudentsForCourse(courseId, { onlyActive: false, limitFrom: 0, limitNumber: 1000, sortBy: "id", sortDirection: "ASC" });
    const student = users.find((u) => Number(u.id) === userId);
    return okJson("core_enrol_get_enrolled_users", { mode: "course", courseid: courseId, user: student ? pickStudentSummary(student) : null });
  }
  const courses = await moodleCall("core_enrol_get_users_courses", { userid: userId, returnusercount: 0 });
  return okJson("core_enrol_get_users_courses", {
    mode: "all_user_courses", userid: userId,
    courses: (courses as Record<string, unknown>[]).map((c) => ({
      id: c.id, fullname: c.fullname, shortname: c.shortname,
      lastaccess: c.lastaccess, progress: c.progress, completed: c.completed,
    })),
  });
});

GET("/users/:userId/courses/:courseId/grades", async (_, p) => {
  const data = await moodleCall("gradereport_user_get_grade_items", { courseid: Number(p.courseId), userid: Number(p.userId) });
  return okJson("gradereport_user_get_grade_items", data);
});

GET("/users/:userId/courses/:courseId/completion", async (_, p) => {
  const data = await moodleCall("core_completion_get_activities_completion_status", { courseid: Number(p.courseId), userid: Number(p.userId) });
  return okJson("core_completion_get_activities_completion_status", data);
});

GET("/users/:userId/courses/:courseId/pending-activities", async (url, p) => {
  const userId = Number(p.userId);
  const courseId = Number(p.courseId);
  const includeUntracked = toBool(url.searchParams.get("includeUntracked"), false);

  const [completion, contents, assignmentsResult] = await Promise.all([
    moodleCall("core_completion_get_activities_completion_status", { courseid: courseId, userid: userId }),
    moodleCall("core_course_get_contents", { courseid: courseId }),
    moodleCall("mod_assign_get_assignments", { courseids: [courseId] }),
  ]);

  const modules = new Map<number, Record<string, unknown>>();
  for (const section of (contents as Record<string, unknown>[]) ?? []) {
    for (const mod of (section.modules as Record<string, unknown>[]) ?? []) {
      modules.set(Number(mod.id), { cmid: mod.id, name: mod.name, modname: mod.modname, instance: mod.instance, section: section.name, url: mod.url, completion: mod.completion, dates: mod.dates });
    }
  }

  const assignmentsByCmid = new Map<number, Record<string, unknown>>();
  for (const a of flattenCourseAssignments(assignmentsResult)) {
    assignmentsByCmid.set(Number(a.cmid), { assignmentid: a.id, name: a.name, duedate: a.duedate, cutoffdate: a.cutoffdate, gradingduedate: a.gradingduedate });
  }

  const statuses = (completion as Record<string, unknown>)?.statuses as Record<string, unknown>[] ?? [];
  const pendingTracked = statuses
    .filter((s) => Number(s.state) === 0 && (s.uservisible === undefined || Number(s.uservisible) === 1))
    .map((s) => ({ ...s, module: modules.get(Number(s.cmid)) ?? null, assignment: assignmentsByCmid.get(Number(s.cmid)) ?? null, reason: "completion_incomplete" }));

  let untracked: Record<string, unknown>[] = [];
  if (includeUntracked) {
    const tracked = new Set(statuses.map((s) => Number(s.cmid)));
    untracked = Array.from(modules.values()).filter((m) => !tracked.has(Number(m.cmid))).map((m) => ({ module: m, reason: "not_tracked_by_completion" }));
  }

  return okJson("composed_pending_activities", { userid: userId, courseid: courseId, pendingTracked, untrackedIncluded: includeUntracked, untracked });
});

GET("/assignments/course/:courseId", async (_, p) => {
  const data = await moodleCall("mod_assign_get_assignments", { courseids: [Number(p.courseId)] });
  return okJson("mod_assign_get_assignments", data);
});

GET("/assignments/:assignmentId/submissions", async (url, p) => {
  const statusParam = url.searchParams.get("status");
  const data = await moodleCall("mod_assign_get_submissions", {
    assignmentids: [Number(p.assignmentId)],
    ...(statusParam ? { status: statusParam } : {}),
    since: toInt(url.searchParams.get("since"), 0),
    before: toInt(url.searchParams.get("before"), 0),
  });
  return okJson("mod_assign_get_submissions", data);
});

GET("/assignments/:assignmentId/grades", async (url, p) => {
  const data = await moodleCall("mod_assign_get_grades", {
    assignmentids: [Number(p.assignmentId)],
    since: toInt(url.searchParams.get("since"), 0),
  });
  return okJson("mod_assign_get_grades", data);
});

GET("/reports/pending-grading", async (url) => {
  const courseId = Number(url.searchParams.get("courseId") ?? 0);
  if (!courseId) return errResp(400, "courseId_required", "Informe courseId.");

  const limit = Math.min(toInt(url.searchParams.get("limitAssignments"), 50)!, 200);
  const assignments = await getAssignmentsForCourse(courseId, limit);
  const report: Record<string, unknown>[] = [];

  for (const assignment of assignments) {
    const [submissionsResult, gradesResult] = await Promise.all([
      moodleCall("mod_assign_get_submissions", { assignmentids: [assignment.id], status: "submitted", since: toInt(url.searchParams.get("since"), 0), before: toInt(url.searchParams.get("before"), 0) }),
      moodleCall("mod_assign_get_grades", { assignmentids: [assignment.id], since: 0 }),
    ]);
    const gradeMap = getGradeMap(gradesResult);
    for (const sub of getLatestSubmissions(submissionsResult)) {
      if (sub.status !== "submitted") continue;
      const grade = gradeMap.get(`${assignment.id}:${sub.userid}`);
      const gs = String(sub.gradingstatus ?? "").toLowerCase();
      const graded = gs === "graded" || (grade && grade.grade !== undefined && grade.grade !== null && String(grade.grade).trim() !== "-1");
      if (!graded) {
        report.push({ courseid: courseId, assignmentid: assignment.id, cmid: assignment.cmid, assignmentName: assignment.name, userid: sub.userid, submissionid: sub.id, status: sub.status, gradingstatus: sub.gradingstatus, timecreated: sub.timecreated, timemodified: sub.timemodified, duedate: assignment.duedate, gradingduedate: assignment.gradingduedate });
      }
    }
  }
  return okJson("composed_pending_grading_report", { courseid: courseId, count: report.length, items: report });
});

GET("/reports/pending-delivery", async (url) => {
  const courseId = Number(url.searchParams.get("courseId") ?? 0);
  if (!courseId) return errResp(400, "courseId_required", "Informe courseId.");

  const dueFrom = toInt(url.searchParams.get("dueFrom"), 0)!;
  const dueTo = toInt(url.searchParams.get("dueTo"), nowUnix())!;
  const onlyActive = toBool(url.searchParams.get("onlyActive"), true);
  const limitStudents = Math.min(toInt(url.searchParams.get("limitStudents"), 500)!, 1000);
  const limitAssignments = Math.min(toInt(url.searchParams.get("limitAssignments"), 50)!, 200);

  const [assignments, students] = await Promise.all([
    getAssignmentsForCourse(courseId, limitAssignments),
    getStudentsForCourse(courseId, { onlyActive, limitFrom: 0, limitNumber: limitStudents, sortBy: "lastname", sortDirection: "ASC" }),
  ]);

  const dueAssignments = assignments.filter((a) => { const due = Number(a.duedate ?? 0); return due && due >= dueFrom && due <= dueTo; });
  const report: Record<string, unknown>[] = [];

  for (const assignment of dueAssignments) {
    const submissionsResult = await moodleCall("mod_assign_get_submissions", { assignmentids: [assignment.id], status: "", since: 0, before: 0 });
    const submittedIds = new Set(getLatestSubmissions(submissionsResult).filter((s) => s.status === "submitted").map((s) => Number(s.userid)));
    for (const student of students) {
      if (!submittedIds.has(Number(student.id))) {
        report.push({ courseid: courseId, assignmentid: assignment.id, cmid: assignment.cmid, assignmentName: assignment.name, duedate: assignment.duedate, cutoffdate: assignment.cutoffdate, userid: student.id, fullname: student.fullname, email: student.email, lastaccess: student.lastaccess, lastcourseaccess: student.lastcourseaccess, reason: "no_submitted_submission_found" });
      }
    }
  }

  return okJson("composed_pending_delivery_report", { courseid: courseId, dueFrom, dueTo, assignmentsConsidered: dueAssignments.length, studentsConsidered: students.length, count: report.length, items: report });
});

GET("/reports/configurable/:reportId", async (url, p) => {
  const params: Record<string, unknown> = { reportid: Number(p.reportId) };
  const courseId = toInt(url.searchParams.get("courseId"));
  if (courseId) params.courseid = courseId;
  const data = await moodleCall("block_configurable_reports_get_report_data", params);
  return okJson("block_configurable_reports_get_report_data", data);
});

Deno.serve(async (req: Request) => {
  try {
    const rawUrl = new URL(req.url);
    const path = normalizePath(rawUrl.pathname);
    const url = new URL(`https://proxy${path}${rawUrl.search}`);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return errResp(405, "method_not_allowed", "Use GET.");
    }

    if (path !== "/health") {
      const valid = await validateApiKey(req);
      if (!valid) return errResp(401, "unauthorized", "Bearer token inválido ou inativo.");
    }

    for (const route of routes) {
      const match = route.pattern.exec(url.href);
      if (match) {
        const params = match.pathname.groups as Record<string, string>;
        try {
          return await route.handler(url, params);
        } catch (err) {
          const e = err as Error & { status?: number; moodle?: unknown; raw?: string };
          return jsonResp(e.status ?? 500, { ok: false, error: e.message || "Erro inesperado.", status: e.status ?? 500, moodle: e.moodle, raw: e.raw });
        }
      }
    }

    return errResp(404, "not_found", `Rota não encontrada: ${path}`);
  } catch (err) {
    const e = err as Error;
    return jsonResp(500, { ok: false, error: e.message || "Erro interno inesperado.", status: 500 });
  }
});

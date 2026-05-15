import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY_HASH_SECRET = Deno.env.get("API_KEY_HASH_SECRET") ?? "";
const MOODLE_BASE_URL = (Deno.env.get("MOODLE_BASE_URL") ?? "").replace(/\/$/, "");
const MOODLE_SESSION_SECRET = Deno.env.get("MOODLE_SESSION_SECRET") ?? "";
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
  "core_webservice_get_site_info",
]);

interface AuthContext {
  apiKeyId: string;
  userId?: string | null;
  serviceId?: string | null;
  userServiceId?: string | null;
  moodleMode: "user";
  moodleToken: string;
  moodleUserId?: number | null;
  moodleUsername?: string | null;
  moodleFullname?: string | null;
  sessionId?: string | null;
  sessionExpiresAt?: string | null;
  serviceName?: string | null;
}

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

function splitFlexibleList(value: string | null | undefined): string[] {
  if (!value) return [];
  return String(value)
    .split(/[,\n;|]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function clampInt(value: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = toInt(value, fallback) ?? fallback;
  return Math.max(min, Math.min(n, max));
}

function parseCourseIds(url: URL, max = 10): number[] {
  const ids = splitCsv(url.searchParams.get("courseIds"))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(ids)).slice(0, max);
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function daysSinceUnix(timestamp: unknown): number | null {
  const value = Number(timestamp ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor((nowUnix() - value) / 86400);
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s/g, "").replace("%", "").replace(",", ".");
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(value: string): Promise<string> {
  if (!API_KEY_HASH_SECRET) {
    throw Object.assign(new Error("API_KEY_HASH_SECRET precisa estar configurado."), {
      status: 500,
      error: "hash_secret_missing",
    });
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(API_KEY_HASH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

async function getSessionCryptoKey(): Promise<CryptoKey> {
  if (!MOODLE_SESSION_SECRET) {
    throw Object.assign(new Error("MOODLE_SESSION_SECRET precisa estar configurado para usar sessões Moodle por usuário."), { status: 500 });
  }
  const material = new TextEncoder().encode(MOODLE_SESSION_SECRET);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await getSessionCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
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

async function moodleCall(wsfunction: string, params: Record<string, unknown> = {}, auth?: AuthContext): Promise<unknown> {
  const token = auth?.moodleToken;
  if (!MOODLE_BASE_URL || !token) {
    throw Object.assign(new Error("MOODLE_BASE_URL e uma sessão Moodle ativa precisam estar configurados."), { status: 500 });
  }
  if (!READ_ONLY_FUNCTIONS.has(wsfunction)) {
    throw Object.assign(new Error(`Função Moodle não permitida no proxy read-only: ${wsfunction}`), { status: 403 });
  }

  const body = new URLSearchParams();
  body.set("wstoken", token);
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

function getAssignmentGradeRows(result: unknown): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const assignment of (result as Record<string, unknown[]>)?.assignments ?? []) {
    const a = assignment as Record<string, unknown>;
    for (const grade of (a.grades ?? []) as Record<string, unknown>[]) {
      rows.push({ assignmentid: a.assignmentid, ...grade });
    }
  }
  return rows;
}

function isLaunchedGrade(grade: Record<string, unknown>): boolean {
  const value = numberFromUnknown(grade.grade);
  return value !== null && value >= 0;
}

function pickCourseSummary(course: Record<string, unknown> | undefined) {
  if (!course) return null;
  return {
    id: course.id,
    fullname: course.fullname,
    shortname: course.shortname,
    idnumber: course.idnumber,
    categoryid: course.categoryid,
    visible: course.visible,
    startdate: course.startdate,
    enddate: course.enddate,
  };
}

function extractCourses(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const courses = (result as Record<string, unknown>)?.courses;
  return Array.isArray(courses) ? courses as Record<string, unknown>[] : [];
}

function gradeItemPercent(item: Record<string, unknown> | undefined): number | null {
  if (!item) return null;
  const formatted = numberFromUnknown(item.percentageformatted);
  if (formatted !== null) return formatted;
  const raw = numberFromUnknown(item.graderaw ?? item.gradeformatted);
  const max = numberFromUnknown(item.grademax);
  if (raw !== null && max !== null && max > 0) return (raw / max) * 100;
  return null;
}

function summarizeGradeItems(result: unknown): Record<string, unknown> {
  const usergrades = (result as Record<string, unknown>)?.usergrades as Record<string, unknown>[] ?? [];
  const gradeItems = (usergrades[0]?.gradeitems ?? []) as Record<string, unknown>[];
  const courseItem = gradeItems.find((item) =>
    String(item.itemtype ?? "").toLowerCase() === "course" ||
    normalizeText(item.itemname).includes("total do curso") ||
    normalizeText(item.itemname).includes("curso total")
  );
  const moduleItems = gradeItems.filter((item) => String(item.itemtype ?? "").toLowerCase() === "mod");
  const gradedItems = moduleItems.filter((item) => {
    const raw = numberFromUnknown(item.graderaw ?? item.gradeformatted);
    return raw !== null && raw >= 0;
  });
  const hiddenItems = gradeItems.filter((item) => Number(item.gradehidden ?? 0) === 1);

  let percent = gradeItemPercent(courseItem);
  if (percent === null && gradedItems.length > 0) {
    const percents = gradedItems
      .map((item) => gradeItemPercent(item))
      .filter((value): value is number => value !== null);
    if (percents.length > 0) {
      percent = percents.reduce((sum, value) => sum + value, 0) / percents.length;
    }
  }

  return {
    percent,
    totalGradeItems: gradeItems.length,
    moduleGradeItems: moduleItems.length,
    gradedItems: gradedItems.length,
    hiddenItems: hiddenItems.length,
    courseGradeRaw: courseItem ? courseItem.graderaw ?? courseItem.gradeformatted : null,
    courseGradeMax: courseItem ? courseItem.grademax : null,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getStudentsForCourse(courseId: number, options: {
  onlyActive?: boolean; limitFrom?: number; limitNumber?: number;
  sortBy?: string; sortDirection?: string;
} = {}, auth?: AuthContext): Promise<Record<string, unknown>[]> {
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
  const data = await moodleCall("core_enrol_get_enrolled_users", { courseid: courseId, options: opts }, auth);
  return (data as Record<string, unknown>[]);
}

async function getAssignmentsForCourse(courseId: number, limit = 50, auth?: AuthContext): Promise<Record<string, unknown>[]> {
  const result = await moodleCall("mod_assign_get_assignments", { courseids: [courseId] }, auth);
  return flattenCourseAssignments(result).slice(0, limit);
}

async function getCoursesByIds(courseIds: number[], auth?: AuthContext): Promise<Map<number, Record<string, unknown>>> {
  if (courseIds.length === 0) return new Map();
  const result = await moodleCall("core_course_get_courses_by_field", {
    field: "ids",
    value: courseIds.join(","),
  }, auth);
  const courses = extractCourses(result);
  return new Map(courses.map((course) => [Number(course.id), course]));
}

async function buildPendingGradingForCourse(courseId: number, options: {
  since?: number; before?: number; limitAssignments?: number; itemLimit?: number;
} = {}, auth?: AuthContext): Promise<Record<string, unknown>> {
  const assignments = await getAssignmentsForCourse(courseId, options.limitAssignments ?? 50, auth);
  const report: Record<string, unknown>[] = [];
  let submittedCount = 0;

  for (const assignment of assignments) {
    const [submissionsResult, gradesResult] = await Promise.all([
      moodleCall("mod_assign_get_submissions", {
        assignmentids: [assignment.id],
        status: "submitted",
        since: options.since ?? 0,
        before: options.before ?? 0,
      }, auth),
      moodleCall("mod_assign_get_grades", { assignmentids: [assignment.id], since: 0 }, auth),
    ]);
    const gradeMap = getGradeMap(gradesResult);
    for (const sub of getLatestSubmissions(submissionsResult)) {
      if (sub.status !== "submitted") continue;
      submittedCount += 1;
      const grade = gradeMap.get(`${assignment.id}:${sub.userid}`);
      const gs = String(sub.gradingstatus ?? "").toLowerCase();
      const graded = gs === "graded" || Boolean(grade && isLaunchedGrade(grade));
      if (!graded) {
        report.push({
          courseid: courseId,
          assignmentid: assignment.id,
          cmid: assignment.cmid,
          assignmentName: assignment.name,
          userid: sub.userid,
          submissionid: sub.id,
          status: sub.status,
          gradingstatus: sub.gradingstatus,
          timecreated: sub.timecreated,
          timemodified: sub.timemodified,
          duedate: assignment.duedate,
          gradingduedate: assignment.gradingduedate,
        });
      }
    }
  }

  const itemLimit = options.itemLimit ?? report.length;
  return {
    courseid: courseId,
    assignmentsConsidered: assignments.length,
    submittedCount,
    count: report.length,
    items: report.slice(0, itemLimit),
    truncated: report.length > itemLimit,
  };
}

async function buildPendingDeliveryForCourse(courseId: number, options: {
  dueFrom?: number; dueTo?: number; onlyActive?: boolean; limitStudents?: number;
  limitAssignments?: number; itemLimit?: number;
} = {}, auth?: AuthContext): Promise<Record<string, unknown>> {
  const dueFrom = options.dueFrom ?? 0;
  const dueTo = options.dueTo ?? nowUnix();
  const onlyActive = options.onlyActive ?? true;
  const limitStudents = options.limitStudents ?? 500;
  const limitAssignments = options.limitAssignments ?? 50;

  const [assignments, students] = await Promise.all([
    getAssignmentsForCourse(courseId, limitAssignments, auth),
    getStudentsForCourse(courseId, { onlyActive, limitFrom: 0, limitNumber: limitStudents, sortBy: "lastname", sortDirection: "ASC" }, auth),
  ]);

  const dueAssignments = assignments.filter((a) => {
    const due = Number(a.duedate ?? 0);
    return due && due >= dueFrom && due <= dueTo;
  });
  const report: Record<string, unknown>[] = [];

  for (const assignment of dueAssignments) {
    const submissionsResult = await moodleCall("mod_assign_get_submissions", { assignmentids: [assignment.id], status: "", since: 0, before: 0 }, auth);
    const submittedIds = new Set(getLatestSubmissions(submissionsResult).filter((s) => s.status === "submitted").map((s) => Number(s.userid)));
    for (const student of students) {
      if (!submittedIds.has(Number(student.id))) {
        report.push({
          courseid: courseId,
          assignmentid: assignment.id,
          cmid: assignment.cmid,
          assignmentName: assignment.name,
          duedate: assignment.duedate,
          cutoffdate: assignment.cutoffdate,
          userid: student.id,
          fullname: student.fullname,
          email: student.email,
          lastaccess: student.lastaccess,
          lastcourseaccess: student.lastcourseaccess,
          reason: "no_submitted_submission_found",
        });
      }
    }
  }

  const itemLimit = options.itemLimit ?? report.length;
  return {
    courseid: courseId,
    dueFrom,
    dueTo,
    assignmentsConsidered: dueAssignments.length,
    studentsConsidered: students.length,
    count: report.length,
    items: report.slice(0, itemLimit),
    truncated: report.length > itemLimit,
  };
}

async function buildCourseGradebook(courseId: number, options: {
  since?: number; limitAssignments?: number; includeRows?: boolean; rowLimit?: number;
} = {}, auth?: AuthContext): Promise<Record<string, unknown>> {
  const assignments = await getAssignmentsForCourse(courseId, options.limitAssignments ?? 50, auth);
  const assignmentSummaries: Record<string, unknown>[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const assignment of assignments) {
    const gradesResult = await moodleCall("mod_assign_get_grades", {
      assignmentids: [assignment.id],
      since: options.since ?? 0,
    }, auth);
    const allGrades = getAssignmentGradeRows(gradesResult);
    const launchedGrades = allGrades.filter(isLaunchedGrade);
    const values = launchedGrades
      .map((grade) => numberFromUnknown(grade.grade))
      .filter((value): value is number => value !== null);
    const latestGradeModified = launchedGrades.reduce((max, grade) => {
      const modified = Number(grade.timemodified ?? 0);
      return Number.isFinite(modified) && modified > max ? modified : max;
    }, 0);
    const averageGrade = values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    assignmentSummaries.push({
      courseid: courseId,
      assignmentid: assignment.id,
      cmid: assignment.cmid,
      assignmentName: assignment.name,
      duedate: assignment.duedate,
      gradingduedate: assignment.gradingduedate,
      gradeCount: launchedGrades.length,
      averageGrade,
      latestGradeModified: latestGradeModified || null,
    });

    if (options.includeRows) {
      for (const grade of launchedGrades) {
        rows.push({
          courseid: courseId,
          assignmentid: assignment.id,
          assignmentName: assignment.name,
          userid: grade.userid,
          grade: grade.grade,
          timemodified: grade.timemodified,
          grader: grade.grader,
          attemptnumber: grade.attemptnumber,
        });
      }
    }
  }

  const rowLimit = options.rowLimit ?? rows.length;
  const totalLaunchedGrades = assignmentSummaries.reduce((sum, item) => sum + Number(item.gradeCount ?? 0), 0);
  return {
    courseid: courseId,
    assignmentsConsidered: assignments.length,
    assignmentsWithGrades: assignmentSummaries.filter((item) => Number(item.gradeCount ?? 0) > 0).length,
    totalLaunchedGrades,
    assignments: assignmentSummaries,
    gradeRows: rows.slice(0, rowLimit),
    gradeRowsTruncated: rows.length > rowLimit,
  };
}

async function buildStudentsRiskForCourse(courseId: number, options: {
  onlyActive: boolean; limitStudents: number; minGradePercent: number; inactiveDays: number;
  includeGrades: boolean; includeCompletion: boolean; onlyRisk: boolean;
}, auth?: AuthContext): Promise<Record<string, unknown>> {
  const students = await getStudentsForCourse(courseId, {
    onlyActive: options.onlyActive,
    limitFrom: 0,
    limitNumber: options.limitStudents,
    sortBy: "lastname",
    sortDirection: "ASC",
  }, auth);

  const items = await mapLimit(students, 4, async (student) => {
    const reasons: string[] = [];
    let score = 0;
    let gradeSummary: Record<string, unknown> | null = null;
    let completionSummary: Record<string, unknown> | null = null;
    const lastAccess = Number(student.lastcourseaccess || student.lastaccess || 0);
    const daysWithoutAccess = daysSinceUnix(lastAccess);

    if (daysWithoutAccess === null) {
      score += 1;
      reasons.push("sem_acesso_registrado");
    } else if (daysWithoutAccess > options.inactiveDays * 2) {
      score += 3;
      reasons.push("sem_acesso_ha_muito_tempo");
    } else if (daysWithoutAccess > options.inactiveDays) {
      score += 2;
      reasons.push("sem_acesso_recente");
    } else if (daysWithoutAccess > Math.ceil(options.inactiveDays / 2)) {
      score += 1;
      reasons.push("acesso_em_atencao");
    }

    if (options.includeGrades) {
      try {
        const gradeResult = await moodleCall("gradereport_user_get_grade_items", {
          courseid: courseId,
          userid: Number(student.id),
        }, auth);
        gradeSummary = summarizeGradeItems(gradeResult);
        const percent = gradeSummary.percent as number | null;
        if (percent !== null && percent < options.minGradePercent - 20) {
          score += 4;
          reasons.push("nota_muito_abaixo_do_minimo");
        } else if (percent !== null && percent < options.minGradePercent) {
          score += 3;
          reasons.push("nota_abaixo_do_minimo");
        } else if (percent !== null && percent < options.minGradePercent + 10) {
          score += 1;
          reasons.push("nota_proxima_do_minimo");
        } else if (percent === null && Number(gradeSummary.gradedItems ?? 0) === 0) {
          score += 1;
          reasons.push("sem_nota_lancada");
        }
      } catch (err) {
        gradeSummary = { error: (err as Error).message };
        reasons.push("nota_indisponivel");
      }
    }

    if (options.includeCompletion) {
      try {
        const completion = await moodleCall("core_completion_get_activities_completion_status", {
          courseid: courseId,
          userid: Number(student.id),
        }, auth);
        const statuses = (completion as Record<string, unknown>)?.statuses as Record<string, unknown>[] ?? [];
        const incompleteVisible = statuses.filter((status) =>
          Number(status.state) === 0 && (status.uservisible === undefined || Number(status.uservisible) === 1)
        );
        completionSummary = {
          trackedItems: statuses.length,
          incompleteVisible: incompleteVisible.length,
        };
        if (incompleteVisible.length >= 5) {
          score += 2;
          reasons.push("muitas_atividades_incompletas");
        } else if (incompleteVisible.length > 0) {
          score += 1;
          reasons.push("atividades_incompletas");
        }
      } catch (err) {
        completionSummary = { error: (err as Error).message };
        reasons.push("conclusao_indisponivel");
      }
    }

    const riskLevel = score >= 5 ? "critico" : score >= 3 ? "risco" : score >= 1 ? "atencao" : "ok";
    return {
      courseid: courseId,
      student: pickStudentSummary(student),
      riskLevel,
      riskScore: score,
      reasons,
      daysWithoutAccess,
      lastAccess: lastAccess || null,
      grade: gradeSummary,
      completion: completionSummary,
    };
  });

  const filtered = options.onlyRisk ? items.filter((item) => item.riskLevel !== "ok") : items;
  const summary = {
    studentsConsidered: students.length,
    returned: filtered.length,
    ok: items.filter((item) => item.riskLevel === "ok").length,
    atencao: items.filter((item) => item.riskLevel === "atencao").length,
    risco: items.filter((item) => item.riskLevel === "risco").length,
    critico: items.filter((item) => item.riskLevel === "critico").length,
  };

  return { courseid: courseId, summary, students: filtered };
}

async function buildCourseAudit(courseId: number, options: {
  expectedItems: string[]; requiredTypes: string[]; scheduleKeywords: string[];
}, auth?: AuthContext): Promise<Record<string, unknown>> {
  const contents = await moodleCall("core_course_get_contents", { courseid: courseId }, auth);
  const sections = Array.isArray(contents) ? contents as Record<string, unknown>[] : [];
  const modules: Record<string, unknown>[] = [];
  const typeCounts = new Map<string, number>();

  for (const section of sections) {
    const sectionModules = (section.modules ?? []) as Record<string, unknown>[];
    for (const mod of sectionModules) {
      const modname = String(mod.modname ?? "unknown").toLowerCase();
      typeCounts.set(modname, (typeCounts.get(modname) ?? 0) + 1);
      modules.push({
        sectionId: section.id,
        sectionName: section.name,
        cmid: mod.id,
        name: mod.name,
        modname,
        instance: mod.instance,
        url: mod.url,
        visible: mod.visible,
        uservisible: mod.uservisible,
        dates: mod.dates,
      });
    }
  }

  const normalizedModules = modules.map((mod) => ({
    mod,
    text: normalizeText(`${mod.name ?? ""} ${mod.sectionName ?? ""}`),
  }));
  const expectedMatches = options.expectedItems.map((item) => {
    const needle = normalizeText(item);
    const matches = normalizedModules
      .filter((entry) => needle && (entry.text.includes(needle) || needle.includes(normalizeText(entry.mod.name))))
      .map((entry) => entry.mod);
    return { expected: item, found: matches.length > 0, matches };
  });
  const requiredTypeChecks = options.requiredTypes.map((type) => ({
    type,
    found: (typeCounts.get(type.toLowerCase()) ?? 0) > 0,
    count: typeCounts.get(type.toLowerCase()) ?? 0,
  }));
  const scheduleNeedles = options.scheduleKeywords.length > 0
    ? options.scheduleKeywords
    : ["cronograma", "calendario", "calendário", "agenda"];
  const scheduleModules = normalizedModules
    .filter((entry) => scheduleNeedles.some((keyword) => entry.text.includes(normalizeText(keyword))))
    .map((entry) => entry.mod);
  const emptySections = sections
    .filter((section) => (((section.modules ?? []) as unknown[]).length === 0))
    .map((section) => ({ id: section.id, name: section.name }));

  return {
    courseid: courseId,
    summary: {
      sections: sections.length,
      modules: modules.length,
      typeCounts: Object.fromEntries(typeCounts.entries()),
      emptySections: emptySections.length,
      expectedItems: options.expectedItems.length,
      missingExpectedItems: expectedMatches.filter((item) => !item.found).length,
      missingRequiredTypes: requiredTypeChecks.filter((item) => !item.found).length,
      scheduleModules: scheduleModules.length,
    },
    expectedMatches,
    requiredTypeChecks,
    scheduleCheck: {
      status: scheduleModules.length > 0 ? "found" : "not_found",
      keywords: scheduleNeedles,
      modules: scheduleModules,
      note: "A API verifica presença de itens de cronograma por nome. Comparação detalhada com planilha deve ser feita pelo GPT a partir dos itens esperados extraídos do Excel.",
    },
    emptySections,
    modules,
  };
}

async function validateApiKey(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  if (!token.startsWith("gah_live_")) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const keyHash = await hmacSha256(token);

  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .eq("active", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || apiKey === null) return null;

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, name, slug, status")
    .eq("slug", "moodle")
    .maybeSingle();

  if (serviceError || !service || service.status !== "available") {
    throw Object.assign(new Error("Serviço Moodle indisponível."), {
      status: 403,
      error: "service_unavailable",
    });
  }

  const { data: userService, error: userServiceError } = await supabase
    .from("user_services")
    .select("id, status")
    .eq("user_id", apiKey.user_id)
    .eq("service_id", service.id)
    .maybeSingle();

  if (userServiceError) {
    throw Object.assign(new Error("Erro ao validar serviço ativo."), {
      status: 500,
      error: "service_validation_error",
    });
  }

  if (!userService || userService.status !== "active") {
    throw Object.assign(new Error("Serviço Moodle não está ativo para esta conta."), {
      status: 403,
      error: "service_inactive",
    });
  }

  const { data: session, error: sessionError } = await supabase
    .from("moodle_user_sessions")
    .select("id, moodle_user_id, moodle_username, moodle_fullname, service_name, token_ciphertext, token_iv, expires_at")
    .eq("user_id", apiKey.user_id)
    .eq("service_id", service.id)
    .eq("user_service_id", userService.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw Object.assign(new Error("Erro ao consultar sessão Moodle."), {
      status: 500,
      error: "moodle_session_lookup_error",
    });
  }

  if (!session) {
    throw Object.assign(new Error("Serviço Moodle ativo, mas sem sessão Moodle válida. Reative o serviço."), {
      status: 403,
      error: "moodle_session_required",
    });
  }

  const expiresAt = session.expires_at ? new Date(String(session.expires_at)) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw Object.assign(new Error("Sessão Moodle expirada. Reative o serviço Moodle no painel."), {
      status: 401,
      error: "moodle_session_expired",
    });
  }

  const moodleToken = await decryptToken(String(session.token_ciphertext), String(session.token_iv));
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id);

  return {
    apiKeyId: apiKey.id,
    userId: apiKey.user_id,
    serviceId: service.id,
    userServiceId: userService.id,
    moodleMode: "user",
    moodleToken,
    moodleUserId: session.moodle_user_id === null ? null : Number(session.moodle_user_id),
    moodleUsername: session.moodle_username,
    moodleFullname: session.moodle_fullname,
    serviceName: session.service_name,
    sessionId: session.id,
    sessionExpiresAt: session.expires_at,
  };
}

type Handler = (url: URL, params: Record<string, string>, auth: AuthContext) => Promise<Response>;
interface Route { pattern: URLPattern; handler: Handler; }
const routes: Route[] = [];

function GET(path: string, handler: Handler) {
  routes.push({ pattern: new URLPattern({ pathname: path }), handler });
}

GET("/health", async () =>
  jsonResp(200, {
    ok: true, service: "moodle-consultas-readonly-proxy", readOnly: true,
    moodleBaseUrlConfigured: Boolean(MOODLE_BASE_URL),
    apiKeyHashSecretConfigured: Boolean(API_KEY_HASH_SECRET),
  })
);

GET("/session", async (url, _, auth) => {
  const validate = toBool(url.searchParams.get("validate"), false);
  let validation: Record<string, unknown> | null = null;
  if (validate && auth.moodleMode === "user") {
    const siteInfo = await moodleCall("core_webservice_get_site_info", {}, auth) as Record<string, unknown>;
    validation = {
      userid: siteInfo.userid ?? null,
      username: siteInfo.username ?? null,
      fullname: siteInfo.fullname ?? null,
      siteurl: siteInfo.siteurl ?? null,
    };
  }
  return okJson("moodle_session", {
    mode: auth.moodleMode,
    usingUserToken: auth.moodleMode === "user",
    moodleUserId: auth.moodleUserId ?? null,
    moodleUsername: auth.moodleUsername ?? null,
    moodleFullname: auth.moodleFullname ?? null,
    serviceName: auth.serviceName ?? null,
    sessionExpiresAt: auth.sessionExpiresAt ?? null,
    validation,
  });
});

GET("/courses", async (url, _, auth) => {
  const data = await moodleCall("core_course_get_courses_by_field", {
    field: url.searchParams.get("field") ?? "",
    value: url.searchParams.get("value") ?? "",
  }, auth);
  return okJson("core_course_get_courses_by_field", data);
});

GET("/courses/search", async (url, _, auth) => {
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query) return errResp(400, "query_required", "Informe query.");
  const data = await moodleCall("core_course_search_courses", {
    criterianame: "search", criteriavalue: query,
    page: toInt(url.searchParams.get("page"), 0),
    perpage: Math.min(toInt(url.searchParams.get("perPage"), 20)!, 100),
    limittoenrolled: toBool(url.searchParams.get("limitToEnrolled"), false) ? 1 : 0,
  }, auth);
  return okJson("core_course_search_courses", data);
});

GET("/courses/:courseId/contents", async (_, p, auth) => {
  const data = await moodleCall("core_course_get_contents", { courseid: Number(p.courseId) }, auth);
  return okJson("core_course_get_contents", data);
});

GET("/courses/:courseId/students", async (url, p, auth) => {
  const data = await getStudentsForCourse(Number(p.courseId), {
    onlyActive: toBool(url.searchParams.get("onlyActive"), true),
    limitFrom: toInt(url.searchParams.get("limitFrom"), 0),
    limitNumber: Math.min(toInt(url.searchParams.get("limitNumber"), 100)!, 500),
    sortBy: url.searchParams.get("sortBy") ?? "lastname",
    sortDirection: url.searchParams.get("sortDirection") ?? "ASC",
  }, auth);
  return okJson("core_enrol_get_enrolled_users", data.map(pickStudentSummary));
});

GET("/users/search", async (url, _, auth) => {
  const key = (url.searchParams.get("key") ?? "").trim();
  const value = (url.searchParams.get("value") ?? "").trim();
  if (!key || !value) return errResp(400, "criteria_required", "Informe key e value.");
  const data = await moodleCall("core_user_get_users", { criteria: [{ key, value }] }, auth);
  return okJson("core_user_get_users", data);
});

GET("/users/by-field", async (url, _, auth) => {
  const field = (url.searchParams.get("field") ?? "").trim();
  const values = splitCsv(url.searchParams.get("values"));
  if (!field || values.length === 0) return errResp(400, "field_values_required", "Informe field e values.");
  const data = await moodleCall("core_user_get_users_by_field", { field, values }, auth);
  return okJson("core_user_get_users_by_field", data);
});

GET("/users/:userId/courses", async (url, p, auth) => {
  const data = await moodleCall("core_enrol_get_users_courses", {
    userid: Number(p.userId),
    returnusercount: toBool(url.searchParams.get("returnUserCount"), false) ? 1 : 0,
  }, auth);
  return okJson("core_enrol_get_users_courses", data);
});

GET("/users/:userId/last-access", async (url, p, auth) => {
  const userId = Number(p.userId);
  const courseId = toInt(url.searchParams.get("courseId"));
  if (courseId) {
    const users = await getStudentsForCourse(courseId, { onlyActive: false, limitFrom: 0, limitNumber: 1000, sortBy: "id", sortDirection: "ASC" }, auth);
    const student = users.find((u) => Number(u.id) === userId);
    return okJson("core_enrol_get_enrolled_users", { mode: "course", courseid: courseId, user: student ? pickStudentSummary(student) : null });
  }
  const courses = await moodleCall("core_enrol_get_users_courses", { userid: userId, returnusercount: 0 }, auth);
  return okJson("core_enrol_get_users_courses", {
    mode: "all_user_courses", userid: userId,
    courses: (courses as Record<string, unknown>[]).map((c) => ({
      id: c.id, fullname: c.fullname, shortname: c.shortname,
      lastaccess: c.lastaccess, progress: c.progress, completed: c.completed,
    })),
  });
});

GET("/users/:userId/courses/:courseId/grades", async (_, p, auth) => {
  const data = await moodleCall("gradereport_user_get_grade_items", { courseid: Number(p.courseId), userid: Number(p.userId) }, auth);
  return okJson("gradereport_user_get_grade_items", data);
});

GET("/users/:userId/courses/:courseId/completion", async (_, p, auth) => {
  const data = await moodleCall("core_completion_get_activities_completion_status", { courseid: Number(p.courseId), userid: Number(p.userId) }, auth);
  return okJson("core_completion_get_activities_completion_status", data);
});

GET("/users/:userId/courses/:courseId/pending-activities", async (url, p, auth) => {
  const userId = Number(p.userId);
  const courseId = Number(p.courseId);
  const includeUntracked = toBool(url.searchParams.get("includeUntracked"), false);

  const [completion, contents, assignmentsResult] = await Promise.all([
    moodleCall("core_completion_get_activities_completion_status", { courseid: courseId, userid: userId }, auth),
    moodleCall("core_course_get_contents", { courseid: courseId }, auth),
    moodleCall("mod_assign_get_assignments", { courseids: [courseId] }, auth),
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

GET("/assignments/course/:courseId", async (_, p, auth) => {
  const data = await moodleCall("mod_assign_get_assignments", { courseids: [Number(p.courseId)] }, auth);
  return okJson("mod_assign_get_assignments", data);
});

GET("/assignments/:assignmentId/submissions", async (url, p, auth) => {
  const statusParam = url.searchParams.get("status");
  const data = await moodleCall("mod_assign_get_submissions", {
    assignmentids: [Number(p.assignmentId)],
    ...(statusParam ? { status: statusParam } : {}),
    since: toInt(url.searchParams.get("since"), 0),
    before: toInt(url.searchParams.get("before"), 0),
  }, auth);
  return okJson("mod_assign_get_submissions", data);
});

GET("/assignments/:assignmentId/grades", async (url, p, auth) => {
  const data = await moodleCall("mod_assign_get_grades", {
    assignmentids: [Number(p.assignmentId)],
    since: toInt(url.searchParams.get("since"), 0),
  }, auth);
  return okJson("mod_assign_get_grades", data);
});

GET("/reports/pending-grading", async (url, _, auth) => {
  const courseId = Number(url.searchParams.get("courseId") ?? 0);
  if (!courseId) return errResp(400, "courseId_required", "Informe courseId.");

  const limit = Math.min(toInt(url.searchParams.get("limitAssignments"), 50)!, 200);
  const report = await buildPendingGradingForCourse(courseId, {
    since: toInt(url.searchParams.get("since"), 0),
    before: toInt(url.searchParams.get("before"), 0),
    limitAssignments: limit,
  }, auth);
  return okJson("composed_pending_grading_report", report);
});

GET("/reports/pending-delivery", async (url, _, auth) => {
  const courseId = Number(url.searchParams.get("courseId") ?? 0);
  if (!courseId) return errResp(400, "courseId_required", "Informe courseId.");

  const dueFrom = toInt(url.searchParams.get("dueFrom"), 0)!;
  const dueTo = toInt(url.searchParams.get("dueTo"), nowUnix())!;
  const onlyActive = toBool(url.searchParams.get("onlyActive"), true);
  const limitStudents = Math.min(toInt(url.searchParams.get("limitStudents"), 500)!, 1000);
  const limitAssignments = Math.min(toInt(url.searchParams.get("limitAssignments"), 50)!, 200);
  const report = await buildPendingDeliveryForCourse(courseId, {
    dueFrom,
    dueTo,
    onlyActive,
    limitStudents,
    limitAssignments,
  }, auth);

  return okJson("composed_pending_delivery_report", report);
});

GET("/reports/courses-summary", async (url, _, auth) => {
  const courseIds = parseCourseIds(url, 10);
  if (courseIds.length === 0) return errResp(400, "courseIds_required", "Informe courseIds com IDs separados por vírgula.");

  const limitAssignments = clampInt(url.searchParams.get("limitAssignments"), 50, 1, 200);
  const limitStudents = clampInt(url.searchParams.get("limitStudents"), 500, 1, 1000);
  const pendingItemLimit = clampInt(url.searchParams.get("pendingItemLimit"), 10, 0, 100);
  const includeContents = toBool(url.searchParams.get("includeContents"), true);
  const includeGradebook = toBool(url.searchParams.get("includeGradebook"), true);
  const includePendingDelivery = toBool(url.searchParams.get("includePendingDelivery"), false);
  const dueFrom = toInt(url.searchParams.get("dueFrom"), 0);
  const dueTo = toInt(url.searchParams.get("dueTo"), nowUnix());
  const courses: Record<string, unknown>[] = [];
  const warnings: Record<string, unknown>[] = [];
  let courseMap = new Map<number, Record<string, unknown>>();
  try {
    courseMap = await getCoursesByIds(courseIds, auth);
  } catch (err) {
    warnings.push({ stage: "course_metadata", error: (err as Error).message });
  }

  for (const courseId of courseIds) {
    try {
      const [students, assignments, pendingGrading, pendingDelivery, gradebook, contents] = await Promise.all([
        getStudentsForCourse(courseId, { onlyActive: true, limitFrom: 0, limitNumber: limitStudents, sortBy: "lastname", sortDirection: "ASC" }, auth),
        getAssignmentsForCourse(courseId, limitAssignments, auth),
        buildPendingGradingForCourse(courseId, { limitAssignments, itemLimit: pendingItemLimit }, auth),
        includePendingDelivery
          ? buildPendingDeliveryForCourse(courseId, { dueFrom, dueTo, limitStudents, limitAssignments, itemLimit: pendingItemLimit }, auth)
          : Promise.resolve(null),
        includeGradebook
          ? buildCourseGradebook(courseId, { limitAssignments, includeRows: false }, auth)
          : Promise.resolve(null),
        includeContents
          ? moodleCall("core_course_get_contents", { courseid: courseId }, auth)
          : Promise.resolve(null),
      ]);
      const sections = Array.isArray(contents) ? contents as Record<string, unknown>[] : [];
      const moduleCount = sections.reduce((sum, section) => sum + (((section.modules ?? []) as unknown[]).length), 0);
      courses.push({
        courseid: courseId,
        course: pickCourseSummary(courseMap.get(courseId)) ?? { id: courseId },
        studentsReturned: students.length,
        assignmentsCount: assignments.length,
        pendingGrading,
        pendingDelivery,
        gradebook: gradebook
          ? {
            assignmentsWithGrades: (gradebook as Record<string, unknown>).assignmentsWithGrades,
            totalLaunchedGrades: (gradebook as Record<string, unknown>).totalLaunchedGrades,
          }
          : null,
        contents: includeContents ? { sections: sections.length, modules: moduleCount } : null,
      });
    } catch (err) {
      warnings.push({ courseid: courseId, error: (err as Error).message });
    }
  }

  return okJson("composed_courses_summary", {
    courseIds,
    count: courses.length,
    courses,
    warnings,
    criteria: { limitAssignments, limitStudents, pendingItemLimit, includeContents, includeGradebook, includePendingDelivery, dueFrom, dueTo },
  });
});

GET("/reports/students-risk", async (url, _, auth) => {
  const courseIds = parseCourseIds(url, 10);
  if (courseIds.length === 0) return errResp(400, "courseIds_required", "Informe courseIds com IDs separados por vírgula.");

  const criteria = {
    minGradePercent: clampInt(url.searchParams.get("minGradePercent"), 60, 0, 100),
    inactiveDays: clampInt(url.searchParams.get("inactiveDays"), 15, 1, 365),
    limitStudents: clampInt(url.searchParams.get("limitStudents"), 100, 1, 250),
    onlyActive: toBool(url.searchParams.get("onlyActive"), true),
    includeGrades: toBool(url.searchParams.get("includeGrades"), true),
    includeCompletion: toBool(url.searchParams.get("includeCompletion"), false),
    onlyRisk: toBool(url.searchParams.get("onlyRisk"), true),
  };
  const courses: Record<string, unknown>[] = [];
  const warnings: Record<string, unknown>[] = [];

  for (const courseId of courseIds) {
    try {
      courses.push(await buildStudentsRiskForCourse(courseId, criteria, auth));
    } catch (err) {
      warnings.push({ courseid: courseId, error: (err as Error).message });
    }
  }

  return okJson("composed_students_risk_report", { courseIds, criteria, courses, warnings });
});

GET("/reports/course-gradebook", async (url, _, auth) => {
  const courseIds = parseCourseIds(url, 10);
  if (courseIds.length === 0) return errResp(400, "courseIds_required", "Informe courseIds com IDs separados por vírgula.");

  const limitAssignments = clampInt(url.searchParams.get("limitAssignments"), 50, 1, 200);
  const rowLimit = clampInt(url.searchParams.get("rowLimit"), 200, 0, 1000);
  const includeRows = toBool(url.searchParams.get("includeRows"), false);
  const since = toInt(url.searchParams.get("since"), 0);
  const courses: Record<string, unknown>[] = [];
  const warnings: Record<string, unknown>[] = [];

  for (const courseId of courseIds) {
    try {
      courses.push(await buildCourseGradebook(courseId, { since, limitAssignments, includeRows, rowLimit }, auth));
    } catch (err) {
      warnings.push({ courseid: courseId, error: (err as Error).message });
    }
  }

  return okJson("composed_course_gradebook_report", {
    courseIds,
    criteria: { limitAssignments, rowLimit, includeRows, since },
    courses,
    warnings,
  });
});

GET("/reports/course-audit", async (url, _, auth) => {
  const courseId = Number(url.searchParams.get("courseId") ?? 0);
  if (!courseId) return errResp(400, "courseId_required", "Informe courseId.");

  const expectedItems = splitFlexibleList(url.searchParams.get("expectedItems")).slice(0, 100);
  const requiredTypes = splitFlexibleList(url.searchParams.get("requiredTypes")).slice(0, 50);
  const scheduleKeywords = splitFlexibleList(url.searchParams.get("scheduleKeywords")).slice(0, 20);
  const audit = await buildCourseAudit(courseId, { expectedItems, requiredTypes, scheduleKeywords }, auth);

  return okJson("composed_course_audit", audit, {
    criteria: { expectedItems, requiredTypes, scheduleKeywords },
  });
});

GET("/reports/configurable/:reportId", async (url, p, auth) => {
  const params: Record<string, unknown> = { reportid: Number(p.reportId) };
  const courseId = toInt(url.searchParams.get("courseId"));
  if (courseId) params.courseid = courseId;
  const data = await moodleCall("block_configurable_reports_get_report_data", params, auth);
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

    let auth: AuthContext = {
      apiKeyId: "",
      moodleMode: "user",
      moodleToken: "",
    };
    if (path !== "/health") {
      try {
        const valid = await validateApiKey(req);
        if (!valid) return errResp(401, "unauthorized", "Bearer token inválido ou inativo.");
        auth = valid;
      } catch (err) {
        const e = err as Error & { status?: number; error?: string };
        return errResp(e.status ?? 500, e.error ?? "auth_error", e.message || "Erro ao validar autenticação.");
      }
    }

    for (const route of routes) {
      const match = route.pattern.exec(url.href);
      if (match) {
        const params = match.pathname.groups as Record<string, string>;
        try {
          return await route.handler(url, params, auth);
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

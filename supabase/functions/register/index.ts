import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MOODLE_BASE_URL = (Deno.env.get("MOODLE_BASE_URL") ?? "").replace(/\/$/, "");
const MOODLE_SERVICE_NAME = Deno.env.get("MOODLE_SERVICE_NAME") ?? "";
const MOODLE_SESSION_SECRET = Deno.env.get("MOODLE_SESSION_SECRET") ?? "";
const MOODLE_SESSION_TTL_SECONDS = Number(Deno.env.get("MOODLE_SESSION_TTL_SECONDS") ?? "43200");
const MOODLE_TIMEOUT_MS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errResp(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResp(status, { ok: false, error, message, ...extra });
}

function assertMoodleSessionConfig(): Response | null {
  if (!MOODLE_BASE_URL || !MOODLE_SERVICE_NAME || !MOODLE_SESSION_SECRET) {
    return errResp(
      500,
      "moodle_session_not_configured",
      "MOODLE_BASE_URL, MOODLE_SERVICE_NAME e MOODLE_SESSION_SECRET precisam estar configurados para validar login Moodle."
    );
  }
  return null;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function getCryptoKey(): Promise<CryptoKey> {
  const material = new TextEncoder().encode(MOODLE_SESSION_SECRET);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

async function encryptToken(token: string): Promise<{ token_ciphertext: string; token_iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return {
    token_ciphertext: toBase64(encrypted),
    token_iv: toBase64(iv),
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MOODLE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("Resposta do Moodle não veio em JSON."), { status: 502 });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Erro HTTP do Moodle: ${response.status}`), { status: 502, moodle: data });
    }
    return data;
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") {
      throw Object.assign(new Error(`Timeout ao chamar o Moodle (>${MOODLE_TIMEOUT_MS}ms).`), { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestMoodleUserToken(username: string, password: string): Promise<string> {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  body.set("service", MOODLE_SERVICE_NAME);

  const data = await fetchJsonWithTimeout(`${MOODLE_BASE_URL}/login/token.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }) as Record<string, unknown>;

  if (data.error || data.errorcode) {
    throw Object.assign(
      new Error(String(data.error || data.message || "Login Moodle inválido ou serviço não permitido para este usuário.")),
      { status: 401, moodle: data }
    );
  }
  const token = String(data.token ?? "");
  if (!token) {
    throw Object.assign(new Error("O Moodle não retornou token para este usuário/serviço."), { status: 401, moodle: data });
  }
  return token;
}

async function getMoodleSiteInfo(token: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  body.set("wstoken", token);
  body.set("wsfunction", "core_webservice_get_site_info");
  body.set("moodlewsrestformat", "json");

  const data = await fetchJsonWithTimeout(`${MOODLE_BASE_URL}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }) as Record<string, unknown>;

  if (data.exception || data.errorcode) {
    throw Object.assign(
      new Error(String(data.message || "Token Moodle gerado, mas o serviço não permite consultar core_webservice_get_site_info.")),
      { status: 403, moodle: data }
    );
  }
  return data;
}

function sessionExpiresAt(): string | null {
  if (!Number.isFinite(MOODLE_SESSION_TTL_SECONDS) || MOODLE_SESSION_TTL_SECONDS <= 0) return null;
  return new Date(Date.now() + MOODLE_SESSION_TTL_SECONDS * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errResp(405, "method_not_allowed", "Use POST.");
  }

  const configError = assertMoodleSessionConfig();
  if (configError) return configError;

  let body: { name?: string; email?: string; moodleUsername?: string; moodlePassword?: string };
  try {
    body = await req.json();
  } catch {
    return errResp(400, "invalid_json", "Body deve ser JSON com name, email, moodleUsername e moodlePassword.");
  }

  const name = (body?.name ?? "").trim();
  const email = (body?.email ?? "").trim().toLowerCase();
  const moodleUsername = (body?.moodleUsername ?? "").trim();
  const moodlePassword = body?.moodlePassword ?? "";

  if (!name || !email || !moodleUsername || !moodlePassword) {
    return errResp(422, "validation_error", "Os campos name, email, moodleUsername e moodlePassword são obrigatórios.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errResp(422, "validation_error", "E-mail inválido.");
  }

  let moodleToken: string;
  let siteInfo: Record<string, unknown>;
  try {
    moodleToken = await requestMoodleUserToken(moodleUsername, moodlePassword);
    siteInfo = await getMoodleSiteInfo(moodleToken);
  } catch (err) {
    const e = err as Error & { status?: number; moodle?: unknown };
    return errResp(e.status ?? 502, "moodle_login_failed", e.message || "Não foi possível validar o login no Moodle.", {
      moodle: e.moodle,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const encryptedToken = await encryptToken(moodleToken);
  const expiresAt = sessionExpiresAt();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ name, email })
    .select("id, api_key")
    .single();

  if (error) {
    if (error.code === "23505") {
      return errResp(409, "email_already_registered", "Este e-mail já está cadastrado.");
    }
    return errResp(500, "db_error", "Erro ao cadastrar. Tente novamente.");
  }

  const { error: sessionError } = await supabase
    .from("moodle_user_sessions")
    .insert({
      api_key_id: data.id,
      moodle_user_id: siteInfo.userid ?? null,
      moodle_username: String(siteInfo.username ?? moodleUsername),
      moodle_fullname: siteInfo.fullname ? String(siteInfo.fullname) : null,
      service_name: MOODLE_SERVICE_NAME,
      token_ciphertext: encryptedToken.token_ciphertext,
      token_iv: encryptedToken.token_iv,
      expires_at: expiresAt,
      last_validated_at: new Date().toISOString(),
    });

  if (sessionError) {
    await supabase.from("api_keys").delete().eq("id", data.id);
    return errResp(500, "session_db_error", "Login Moodle validado, mas não foi possível registrar a sessão.");
  }

  return jsonResp(201, {
    ok: true,
    api_key: data.api_key,
    moodle_user: {
      id: siteInfo.userid ?? null,
      username: siteInfo.username ?? moodleUsername,
      fullname: siteInfo.fullname ?? null,
      siteurl: siteInfo.siteurl ?? null,
    },
    session: {
      mode: "user",
      serviceName: MOODLE_SERVICE_NAME,
      expiresAt,
    },
    message: "Cadastro realizado com sucesso. Guarde sua chave de API — ela não será exibida novamente."
  });
});

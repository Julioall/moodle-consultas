import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY_HASH_SECRET = Deno.env.get("API_KEY_HASH_SECRET") ?? "";
const MOODLE_BASE_URL = (Deno.env.get("MOODLE_BASE_URL") ?? "").replace(/\/$/, "");
const MOODLE_SERVICE_NAME = Deno.env.get("MOODLE_SERVICE_NAME") ?? "";
const MOODLE_SESSION_SECRET = Deno.env.get("MOODLE_SESSION_SECRET") ?? "";
const MOODLE_SESSION_TTL_SECONDS = Number(Deno.env.get("MOODLE_SESSION_TTL_SECONDS") ?? "43200");
const MOODLE_OPENAPI_SCHEMA_URL =
  Deno.env.get("MOODLE_OPENAPI_SCHEMA_URL") ??
  "https://julioall.github.io/moodle-consultas/schemas/moodle.yaml";
const MOODLE_TIMEOUT_MS = 8000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const fallbackMoodleSchema = `openapi: 3.1.0
info:
  title: Moodle Actions Hub API
  version: 2.1.0
servers:
  - url: https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy
security:
  - bearerAuth: []
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        "200":
          description: OK
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`;

type AuthedUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type RouteContext = {
  user: AuthedUser;
  supabase: ReturnType<typeof createClient>;
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function textResp(status: number, body: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": contentType },
  });
}

function errResp(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResp(status, { ok: false, error, message, ...extra });
}

function normalizePath(pathname: string): string {
  return pathname.replace(/^\/platform-api/, "") || "/";
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createApiKey(): string {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return `gah_live_${base64Url(random)}`;
}

function keyPreview(key: string): string {
  return `${key.slice(0, 17)}••••••••••••${key.slice(-6)}`;
}

async function hmacSha256(value: string): Promise<string> {
  if (!API_KEY_HASH_SECRET) {
    throw Object.assign(new Error("API_KEY_HASH_SECRET precisa estar configurado."), { status: 500, code: "hash_secret_missing" });
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

async function getMoodleCryptoKey(usage: KeyUsage): Promise<CryptoKey> {
  if (!MOODLE_SESSION_SECRET) {
    throw Object.assign(new Error("MOODLE_SESSION_SECRET precisa estar configurado."), { status: 500, code: "moodle_secret_missing" });
  }
  const material = new TextEncoder().encode(MOODLE_SESSION_SECRET);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [usage]);
}

async function encryptToken(token: string): Promise<{ token_ciphertext: string; token_iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getMoodleCryptoKey("encrypt");
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return {
    token_ciphertext: toBase64(encrypted),
    token_iv: toBase64(iv),
  };
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await getMoodleCryptoKey("decrypt");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function assertMoodleConfig(): void {
  if (!MOODLE_BASE_URL || !MOODLE_SERVICE_NAME || !MOODLE_SESSION_SECRET) {
    throw Object.assign(
      new Error("MOODLE_BASE_URL, MOODLE_SERVICE_NAME e MOODLE_SESSION_SECRET precisam estar configurados."),
      { status: 500, code: "moodle_not_configured" },
    );
  }
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
      throw Object.assign(new Error("Resposta do Moodle não veio em JSON."), { status: 502, code: "invalid_moodle_json" });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Erro HTTP do Moodle: ${response.status}`), { status: 502, code: "moodle_http_error", moodle: data });
    }
    return data;
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") {
      throw Object.assign(new Error(`Timeout ao chamar o Moodle (>${MOODLE_TIMEOUT_MS}ms).`), { status: 504, code: "moodle_timeout" });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestMoodleUserToken(username: string, password: string): Promise<string> {
  assertMoodleConfig();

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
      { status: 401, code: "moodle_login_failed", moodle: data },
    );
  }

  const token = String(data.token ?? "");
  if (!token) {
    throw Object.assign(new Error("O Moodle não retornou token para este usuário/serviço."), {
      status: 401,
      code: "moodle_token_missing",
      moodle: data,
    });
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
      { status: 403, code: "moodle_permission_failed", moodle: data },
    );
  }
  return data;
}

function sessionExpiresAt(): string | null {
  if (!Number.isFinite(MOODLE_SESSION_TTL_SECONDS) || MOODLE_SESSION_TTL_SECONDS <= 0) return null;
  return new Date(Date.now() + MOODLE_SESSION_TTL_SECONDS * 1000).toISOString();
}

function serviceStatus(service: Record<string, unknown>, userService?: Record<string, unknown> | null): string {
  if (userService?.status) return String(userService.status);
  return String(service.status ?? "available");
}

function serviceDto(service: Record<string, unknown>, userService?: Record<string, unknown> | null) {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    description: service.description,
    catalogStatus: service.status,
    status: serviceStatus(service, userService),
    activatedAt: userService?.activated_at ?? null,
    deactivatedAt: userService?.deactivated_at ?? null,
    errorMessage: userService?.error_message ?? null,
  };
}

async function currentUser(req: Request, supabase: ReturnType<typeof createClient>): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw Object.assign(new Error("JWT ausente. Faça login novamente."), { status: 401, code: "unauthorized" });
  }

  const jwt = header.slice(7).trim();
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    throw Object.assign(new Error("JWT inválido ou expirado. Faça login novamente."), { status: 401, code: "unauthorized" });
  }
  return data.user as AuthedUser;
}

async function ensureProfile(ctx: RouteContext): Promise<Record<string, unknown>> {
  const name = String(ctx.user.user_metadata?.name ?? "");
  const email = String(ctx.user.email ?? "");

  const { data, error } = await ctx.supabase
    .from("profiles")
    .upsert(
      {
        id: ctx.user.id,
        name,
        email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, name, email, created_at, updated_at")
    .single();

  if (error) {
    throw Object.assign(new Error("Não foi possível carregar o perfil da conta."), { status: 500, code: "profile_error", details: error });
  }

  return data;
}

async function listServices(ctx: RouteContext) {
  const { data: services, error } = await ctx.supabase
    .from("services")
    .select("id, name, slug, description, status")
    .order("created_at", { ascending: true });

  if (error) throw Object.assign(new Error("Não foi possível listar serviços."), { status: 500, code: "services_error", details: error });

  const { data: userServices, error: userServicesError } = await ctx.supabase
    .from("user_services")
    .select("id, service_id, status, activated_at, deactivated_at, error_message")
    .eq("user_id", ctx.user.id);

  if (userServicesError) {
    throw Object.assign(new Error("Não foi possível consultar serviços ativados."), { status: 500, code: "user_services_error", details: userServicesError });
  }

  const byService = new Map((userServices ?? []).map((item) => [String(item.service_id), item]));
  return (services ?? []).map((service) => serviceDto(service, byService.get(String(service.id))));
}

async function getService(ctx: RouteContext, slug: string) {
  const { data: service, error } = await ctx.supabase
    .from("services")
    .select("id, name, slug, description, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw Object.assign(new Error("Não foi possível consultar o serviço."), { status: 500, code: "service_error", details: error });
  if (!service) throw Object.assign(new Error("Serviço não encontrado."), { status: 404, code: "service_not_found" });

  const { data: userService, error: userServiceError } = await ctx.supabase
    .from("user_services")
    .select("id, service_id, status, activated_at, deactivated_at, error_message")
    .eq("user_id", ctx.user.id)
    .eq("service_id", service.id)
    .maybeSingle();

  if (userServiceError) {
    throw Object.assign(new Error("Não foi possível consultar o status do serviço."), { status: 500, code: "user_service_error", details: userServiceError });
  }

  let moodleSession: Record<string, unknown> | null = null;
  if (slug === "moodle" && userService?.status === "active") {
    const { data: session } = await ctx.supabase
      .from("moodle_user_sessions")
      .select("id, moodle_user_id, moodle_username, moodle_fullname, service_name, expires_at, last_validated_at")
      .eq("user_id", ctx.user.id)
      .eq("service_id", service.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    moodleSession = session ?? null;
  }

  return { ...serviceDto(service, userService), moodleSession };
}

async function activateMoodle(ctx: RouteContext, slug: string, req: Request) {
  if (slug !== "moodle") {
    throw Object.assign(new Error("Este serviço ainda não possui fluxo de ativação."), { status: 400, code: "service_not_configurable" });
  }

  const { data: service, error: serviceError } = await ctx.supabase
    .from("services")
    .select("id, name, slug, description, status")
    .eq("slug", slug)
    .maybeSingle();

  if (serviceError) throw Object.assign(new Error("Não foi possível consultar o serviço."), { status: 500, code: "service_error", details: serviceError });
  if (!service) throw Object.assign(new Error("Serviço não encontrado."), { status: 404, code: "service_not_found" });
  if (service.status !== "available") {
    throw Object.assign(new Error("Serviço ainda não disponível para ativação."), { status: 409, code: "service_unavailable" });
  }

  let body: { moodleUsername?: string; moodlePassword?: string };
  try {
    body = await req.json();
  } catch {
    throw Object.assign(new Error("Body deve ser JSON com moodleUsername e moodlePassword."), { status: 400, code: "invalid_json" });
  }

  const moodleUsername = (body.moodleUsername ?? "").trim();
  const moodlePassword = body.moodlePassword ?? "";
  if (!moodleUsername || !moodlePassword) {
    throw Object.assign(new Error("Informe usuário e senha do Moodle."), { status: 422, code: "validation_error" });
  }

  const moodleToken = await requestMoodleUserToken(moodleUsername, moodlePassword);
  const siteInfo = await getMoodleSiteInfo(moodleToken);
  const encrypted = await encryptToken(moodleToken);
  const now = new Date().toISOString();
  const expiresAt = sessionExpiresAt();

  const { data: userService, error: upsertError } = await ctx.supabase
    .from("user_services")
    .upsert(
      {
        user_id: ctx.user.id,
        service_id: service.id,
        status: "active",
        activated_at: now,
        deactivated_at: null,
        error_message: null,
        updated_at: now,
      },
      { onConflict: "user_id,service_id" },
    )
    .select("id, service_id, status, activated_at, deactivated_at, error_message")
    .single();

  if (upsertError) {
    throw Object.assign(new Error("Login Moodle validado, mas não foi possível ativar o serviço."), { status: 500, code: "user_service_save_error", details: upsertError });
  }

  await ctx.supabase
    .from("moodle_user_sessions")
    .update({ active: false, updated_at: now })
    .eq("user_service_id", userService.id)
    .eq("active", true);

  const { error: sessionError } = await ctx.supabase
    .from("moodle_user_sessions")
    .insert({
      user_id: ctx.user.id,
      service_id: service.id,
      user_service_id: userService.id,
      moodle_user_id: siteInfo.userid ?? null,
      moodle_username: String(siteInfo.username ?? moodleUsername),
      moodle_fullname: siteInfo.fullname ? String(siteInfo.fullname) : null,
      service_name: MOODLE_SERVICE_NAME,
      token_ciphertext: encrypted.token_ciphertext,
      token_iv: encrypted.token_iv,
      expires_at: expiresAt,
      last_validated_at: now,
    });

  if (sessionError) {
    await ctx.supabase
      .from("user_services")
      .update({ status: "error", error_message: "Não foi possível salvar a sessão Moodle.", updated_at: now })
      .eq("id", userService.id);
    throw Object.assign(new Error("Login Moodle validado, mas não foi possível salvar a sessão cifrada."), {
      status: 500,
      code: "moodle_session_save_error",
      details: sessionError,
    });
  }

  return {
    service: serviceDto(service, userService),
    moodleUser: {
      id: siteInfo.userid ?? null,
      username: siteInfo.username ?? moodleUsername,
      fullname: siteInfo.fullname ?? null,
      siteurl: siteInfo.siteurl ?? null,
    },
    session: {
      expiresAt,
      serviceName: MOODLE_SERVICE_NAME,
    },
  };
}

async function deactivateService(ctx: RouteContext, slug: string) {
  const service = await getService(ctx, slug);
  if (service.catalogStatus !== "available") {
    throw Object.assign(new Error("Serviço indisponível."), { status: 409, code: "service_unavailable" });
  }

  const now = new Date().toISOString();
  const { data: serviceRow } = await ctx.supabase
    .from("services")
    .select("id")
    .eq("slug", slug)
    .single();

  const { data: userService, error } = await ctx.supabase
    .from("user_services")
    .update({
      status: "inactive",
      deactivated_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("user_id", ctx.user.id)
    .eq("service_id", serviceRow.id)
    .select("id")
    .maybeSingle();

  if (error) throw Object.assign(new Error("Não foi possível desativar o serviço."), { status: 500, code: "deactivate_error", details: error });

  if (userService?.id) {
    await ctx.supabase
      .from("moodle_user_sessions")
      .update({ active: false, updated_at: now })
      .eq("user_service_id", userService.id)
      .eq("active", true);
  }

  return getService(ctx, slug);
}

async function currentApiKey(ctx: RouteContext) {
  const { data, error } = await ctx.supabase
    .from("api_keys")
    .select("id, key_preview, created_at, last_used_at")
    .eq("user_id", ctx.user.id)
    .eq("active", true)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw Object.assign(new Error("Não foi possível consultar a chave de API."), { status: 500, code: "api_key_error", details: error });

  return data
    ? {
      id: data.id,
      keyPreview: data.key_preview,
      createdAt: data.created_at,
      lastUsedAt: data.last_used_at,
    }
    : null;
}

async function regenerateApiKey(ctx: RouteContext) {
  const apiKey = createApiKey();
  const keyHash = await hmacSha256(apiKey);
  const now = new Date().toISOString();

  await ctx.supabase
    .from("api_keys")
    .update({ active: false, revoked_at: now })
    .eq("user_id", ctx.user.id)
    .eq("active", true)
    .is("revoked_at", null);

  const { data, error } = await ctx.supabase
    .from("api_keys")
    .insert({
      user_id: ctx.user.id,
      key_hash: keyHash,
      key_preview: keyPreview(apiKey),
      active: true,
    })
    .select("id, key_preview, created_at, last_used_at")
    .single();

  if (error) throw Object.assign(new Error("Não foi possível gerar uma nova chave de API."), { status: 500, code: "api_key_regenerate_error", details: error });

  return {
    apiKey,
    key: {
      id: data.id,
      keyPreview: data.key_preview,
      createdAt: data.created_at,
      lastUsedAt: data.last_used_at,
    },
    message: "Guarde esta chave agora. Ela não poderá ser consultada novamente.",
  };
}

async function listSchemas(ctx: RouteContext) {
  const services = await listServices(ctx);
  return services
    .filter((service) => service.slug === "moodle" || service.catalogStatus === "available")
    .map((service) => ({
      serviceSlug: service.slug,
      serviceName: service.name,
      format: "yaml",
      version: service.slug === "moodle" ? "2.1.0" : null,
      url: `/schemas/${service.slug}.yaml`,
      available: service.slug === "moodle",
    }));
}

async function getMoodleSchema(ctx: RouteContext): Promise<string> {
  const { data: schema } = await ctx.supabase
    .from("service_schemas")
    .select("content, services!inner(slug)")
    .eq("services.slug", "moodle")
    .eq("format", "yaml")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (schema?.content) return String(schema.content);

  try {
    const response = await fetch(MOODLE_OPENAPI_SCHEMA_URL, {
      headers: { "Accept": "application/yaml,text/yaml,text/plain" },
    });
    if (response.ok) return await response.text();
  } catch {
    return fallbackMoodleSchema;
  }

  return fallbackMoodleSchema;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const rawUrl = new URL(req.url);
    const path = normalizePath(rawUrl.pathname);
    const user = await currentUser(req, supabase);
    const ctx: RouteContext = { user, supabase };

    if (req.method === "GET" && path === "/auth/me") {
      const profile = await ensureProfile(ctx);
      return jsonResp(200, { ok: true, user: { id: user.id, email: user.email }, profile });
    }

    if (req.method === "GET" && path === "/services") {
      return jsonResp(200, { ok: true, services: await listServices(ctx) });
    }

    const serviceMatch = path.match(/^\/services\/([^/]+)$/);
    if (req.method === "GET" && serviceMatch) {
      return jsonResp(200, { ok: true, service: await getService(ctx, serviceMatch[1]) });
    }

    const activateMatch = path.match(/^\/services\/([^/]+)\/activate$/);
    if (req.method === "POST" && activateMatch) {
      return jsonResp(200, { ok: true, ...(await activateMoodle(ctx, activateMatch[1], req)) });
    }

    const deactivateMatch = path.match(/^\/services\/([^/]+)\/deactivate$/);
    if (req.method === "POST" && deactivateMatch) {
      return jsonResp(200, { ok: true, service: await deactivateService(ctx, deactivateMatch[1]) });
    }

    if (req.method === "GET" && path === "/api-keys/current") {
      return jsonResp(200, { ok: true, key: await currentApiKey(ctx) });
    }

    if (req.method === "POST" && path === "/api-keys/regenerate") {
      return jsonResp(201, { ok: true, ...(await regenerateApiKey(ctx)) });
    }

    if (req.method === "GET" && path === "/schemas") {
      return jsonResp(200, { ok: true, schemas: await listSchemas(ctx) });
    }

    const schemaMatch = path.match(/^\/schemas\/([^/]+)\.yaml$/);
    if (req.method === "GET" && schemaMatch) {
      if (schemaMatch[1] !== "moodle") {
        return errResp(404, "schema_not_found", "Schema não encontrado.");
      }
      return textResp(200, await getMoodleSchema(ctx), "application/yaml; charset=utf-8");
    }

    return errResp(404, "not_found", `Rota não encontrada: ${path}`);
  } catch (err) {
    const e = err as Error & { status?: number; code?: string; moodle?: unknown; details?: unknown };
    return errResp(e.status ?? 500, e.code ?? "internal_error", e.message || "Erro interno inesperado.", {
      moodle: e.moodle,
      details: e.details,
    });
  }
});

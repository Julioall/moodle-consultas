import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLEANUP_TOKEN = Deno.env.get("CLEANUP_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-cleanup-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function countRows(supabase: ReturnType<typeof createClient>, table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp(405, { ok: false, error: "method_not_allowed", message: "Use POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResp(500, { ok: false, error: "supabase_not_configured" });
  }

  if (!CLEANUP_TOKEN) {
    return jsonResp(503, { ok: false, error: "cleanup_disabled" });
  }

  if (req.headers.get("x-cleanup-token") !== CLEANUP_TOKEN) {
    return jsonResp(401, { ok: false, error: "unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const before = {
      apiKeys: await countRows(supabase, "api_keys"),
      moodleSessions: await countRows(supabase, "moodle_user_sessions"),
    };

    const { error: sessionError } = await supabase
      .from("moodle_user_sessions")
      .delete()
      .not("id", "is", null);

    if (sessionError) throw sessionError;

    const { error: apiKeysError } = await supabase
      .from("api_keys")
      .delete()
      .not("id", "is", null);

    if (apiKeysError) throw apiKeysError;

    const after = {
      apiKeys: await countRows(supabase, "api_keys"),
      moodleSessions: await countRows(supabase, "moodle_user_sessions"),
    };

    return jsonResp(200, { ok: true, before, after });
  } catch (err) {
    const error = err as Error;
    return jsonResp(500, {
      ok: false,
      error: "cleanup_failed",
      message: error.message,
    });
  }
});

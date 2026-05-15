const functionsBaseUrl = (
  import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL ??
  'https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1'
).replace(/\/$/, '');

export const registerUrl = `${functionsBaseUrl}/register`;
export const moodleProxyUrl = `${functionsBaseUrl}/moodle-proxy`;

export type RegisterInput = {
  name: string;
  email: string;
  moodleUsername: string;
  moodlePassword: string;
};

export type MoodleUser = {
  id: number | null;
  username: string | null;
  fullname: string | null;
  siteurl?: string | null;
};

export type MoodleSession = {
  mode: 'user' | 'technical';
  serviceName: string | null;
  expiresAt?: string | null;
  sessionExpiresAt?: string | null;
  usingUserToken?: boolean;
  moodleUserId?: number | null;
  moodleUsername?: string | null;
  moodleFullname?: string | null;
};

export type RegisterResponse = {
  ok: true;
  api_key: string;
  moodle_user: MoodleUser;
  session: MoodleSession;
  message: string;
};

type ProxySessionResponse = {
  ok: true;
  data: MoodleSession;
};

type ErrorResponse = {
  ok?: false;
  error?: string;
  message?: string;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(response.status, 'invalid_json', 'A resposta do servidor não veio em JSON.');
  }
}

function extractError(response: Response, data: unknown): ApiError {
  const body = (data ?? {}) as ErrorResponse;
  const message = body.message || body.error || `Erro HTTP ${response.status}.`;
  return new ApiError(response.status, body.error || 'request_failed', message);
}

export async function registerAccount(input: RegisterInput): Promise<RegisterResponse> {
  const response = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw extractError(response, data);
  }

  return data as RegisterResponse;
}

export async function validateApiKey(apiKey: string, validateMoodleSession = false): Promise<MoodleSession> {
  const response = await fetch(`${moodleProxyUrl}/session?validate=${validateMoodleSession ? 'true' : 'false'}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw extractError(response, data);
  }

  return (data as ProxySessionResponse).data;
}

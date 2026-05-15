import { functionsBaseUrl, supabase } from './supabase';

export const platformApiUrl = `${functionsBaseUrl}/platform-api`;
export const moodleProxyUrl = `${functionsBaseUrl}/moodle-proxy`;

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type PlatformUser = {
  id: string;
  email?: string;
};

export type ServiceStatus = 'available' | 'active' | 'inactive' | 'coming_soon' | 'error';

export type PlatformService = {
  id: string;
  name: string;
  slug: string;
  description: string;
  catalogStatus: 'available' | 'coming_soon' | 'error';
  status: ServiceStatus;
  activatedAt: string | null;
  deactivatedAt: string | null;
  errorMessage: string | null;
  moodleSession?: MoodleSession | null;
};

export type MoodleSession = {
  id?: string;
  mode?: 'user';
  serviceName?: string | null;
  expiresAt?: string | null;
  sessionExpiresAt?: string | null;
  usingUserToken?: boolean;
  moodleUserId?: number | null;
  moodleUsername?: string | null;
  moodleFullname?: string | null;
  moodle_user_id?: number | null;
  moodle_username?: string | null;
  moodle_fullname?: string | null;
  service_name?: string | null;
  expires_at?: string | null;
};

export type MoodleUser = {
  id: number | null;
  username: string | null;
  fullname: string | null;
  siteurl?: string | null;
};

export type ApiKeyRecord = {
  id: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type SchemaRecord = {
  serviceSlug: string;
  serviceName: string;
  format: 'yaml' | 'json';
  version: string | null;
  url: string;
  available: boolean;
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

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'unauthorized', 'Sessão expirada. Faça login novamente.');
  }
  return token;
}

async function platformJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${platformApiUrl}${path}`, { ...init, headers });
  const data = await parseJson(response);
  if (!response.ok) {
    throw extractError(response, data);
  }
  return data as T;
}

export async function fetchPlatformText(path: string): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(`${platformApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const data = await parseJson(response);
    throw extractError(response, data);
  }

  return response.text();
}

export async function getMe(): Promise<{ ok: true; user: PlatformUser; profile: Profile }> {
  return platformJson('/auth/me');
}

export async function listServices(): Promise<PlatformService[]> {
  const response = await platformJson<{ ok: true; services: PlatformService[] }>('/services');
  return response.services;
}

export async function getService(slug: string): Promise<PlatformService> {
  const response = await platformJson<{ ok: true; service: PlatformService }>(`/services/${slug}`);
  return response.service;
}

export async function activateService(
  slug: string,
  input: { moodleUsername: string; moodlePassword: string },
): Promise<{ service: PlatformService; moodleUser: MoodleUser; session: MoodleSession }> {
  const response = await platformJson<{
    ok: true;
    service: PlatformService;
    moodleUser: MoodleUser;
    session: MoodleSession;
  }>(`/services/${slug}/activate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response;
}

export async function deactivateService(slug: string): Promise<PlatformService> {
  const response = await platformJson<{ ok: true; service: PlatformService }>(`/services/${slug}/deactivate`, {
    method: 'POST',
  });
  return response.service;
}

export async function getCurrentApiKey(): Promise<ApiKeyRecord | null> {
  const response = await platformJson<{ ok: true; key: ApiKeyRecord | null }>('/api-keys/current');
  return response.key;
}

export async function regenerateApiKey(): Promise<{ apiKey: string; key: ApiKeyRecord; message: string }> {
  const response = await platformJson<{ ok: true; apiKey: string; key: ApiKeyRecord; message: string }>(
    '/api-keys/regenerate',
    { method: 'POST' },
  );
  return response;
}

export async function listSchemas(): Promise<SchemaRecord[]> {
  const response = await platformJson<{ ok: true; schemas: SchemaRecord[] }>('/schemas');
  return response.schemas;
}

export async function getSchemaYaml(serviceSlug: string): Promise<string> {
  return fetchPlatformText(`/schemas/${serviceSlug}.yaml`);
}

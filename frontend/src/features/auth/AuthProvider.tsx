import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MoodleSession, MoodleUser, RegisterInput, registerAccount, validateApiKey } from '../../lib/api-client';

const storageKey = 'gpt-actions-hub-session';

export type AuthSession = {
  apiKey: string;
  keyPreview: string;
  email?: string;
  name?: string;
  moodleUser?: MoodleUser;
  session?: MoodleSession;
  createdAt: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (apiKey: string) => Promise<AuthSession>;
  register: (input: RegisterInput) => Promise<AuthSession>;
  refreshSession: (validateMoodleSession?: boolean) => Promise<AuthSession>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function createKeyPreview(apiKey: string): string {
  if (apiKey.length <= 12) return apiKey;
  return `${apiKey.slice(0, 8)}••••${apiKey.slice(-6)}`;
}

function readStoredSession(): AuthSession | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.apiKey || !parsed.createdAt) return null;
    return {
      ...parsed,
      apiKey: parsed.apiKey,
      keyPreview: parsed.keyPreview || createKeyPreview(parsed.apiKey),
      createdAt: parsed.createdAt,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function persistSession(session: AuthSession | null) {
  if (!session) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [isLoading, setIsLoading] = useState(Boolean(session));

  const saveSession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    persistSession(nextSession);
  }, []);

  const login = useCallback(
    async (apiKey: string) => {
      const trimmedKey = apiKey.trim();
      const moodleSession = await validateApiKey(trimmedKey);
      const nextSession: AuthSession = {
        apiKey: trimmedKey,
        keyPreview: createKeyPreview(trimmedKey),
        session: moodleSession,
        moodleUser: {
          id: moodleSession.moodleUserId ?? null,
          username: moodleSession.moodleUsername ?? null,
          fullname: moodleSession.moodleFullname ?? null,
        },
        createdAt: new Date().toISOString(),
      };

      saveSession(nextSession);
      return nextSession;
    },
    [saveSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await registerAccount(input);
      const nextSession: AuthSession = {
        apiKey: result.api_key,
        keyPreview: createKeyPreview(result.api_key),
        email: input.email,
        name: input.name,
        moodleUser: result.moodle_user,
        session: result.session,
        createdAt: new Date().toISOString(),
      };

      saveSession(nextSession);
      return nextSession;
    },
    [saveSession],
  );

  const refreshSession = useCallback(
    async (validateMoodleSession = false) => {
      if (!session?.apiKey) {
        throw new Error('Nenhuma sessão ativa.');
      }

      const moodleSession = await validateApiKey(session.apiKey, validateMoodleSession);
      const nextSession: AuthSession = {
        ...session,
        session: moodleSession,
        moodleUser: {
          ...session.moodleUser,
          id: moodleSession.moodleUserId ?? session.moodleUser?.id ?? null,
          username: moodleSession.moodleUsername ?? session.moodleUser?.username ?? null,
          fullname: moodleSession.moodleFullname ?? session.moodleUser?.fullname ?? null,
        },
      };

      saveSession(nextSession);
      return nextSession;
    },
    [saveSession, session],
  );

  const logout = useCallback(() => {
    saveSession(null);
  }, [saveSession]);

  useEffect(() => {
    if (!session?.apiKey) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    validateApiKey(session.apiKey)
      .then((moodleSession) => {
        if (cancelled) return;
        saveSession({ ...session, session: moodleSession });
      })
      .catch(() => {
        if (cancelled) return;
        saveSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.apiKey),
      isLoading,
      login,
      register,
      refreshSession,
      logout,
    }),
    [isLoading, login, logout, refreshSession, register, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}

import { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, LoginInput, Profile, RegisterInput, getMe } from '../../lib/api-client';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type RegisterResult = {
  requiresEmailConfirmation: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  refreshProfile: () => Promise<Profile | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function configurationError() {
  return new ApiError(
    500,
    'supabase_not_configured',
    'VITE_SUPABASE_ANON_KEY não está configurada para o frontend.',
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!supabase.auth || !isSupabaseConfigured) return null;

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setProfile(null);
      return null;
    }

    const result = await getMe();
    setProfile(result.profile);
    return result.profile;
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      if (!isSupabaseConfigured) throw configurationError();

      const { error } = await supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });

      if (error) {
        throw new ApiError(401, 'login_failed', error.message || 'E-mail ou senha inválidos.');
      }

      await refreshProfile();
    },
    [refreshProfile],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      if (!isSupabaseConfigured) throw configurationError();

      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            name: input.name.trim(),
          },
        },
      });

      if (error) {
        throw new ApiError(422, 'register_failed', error.message || 'Não foi possível criar sua conta.');
      }

      if (data.session) {
        await refreshProfile();
      }

      return { requiresEmailConfirmation: !data.session };
    },
    [refreshProfile],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);

      if (data.session) {
        try {
          await refreshProfile();
        } catch {
          setProfile(null);
        }
      }

      setIsLoading(false);
    }

    void loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated: Boolean(session?.access_token),
      isLoading,
      login,
      register,
      refreshProfile,
      logout,
    }),
    [isLoading, login, logout, profile, refreshProfile, register, session],
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

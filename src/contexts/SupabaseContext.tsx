/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { AdminRole } from '../game/types';
import {
  formatSupabaseAuthError,
  getSupabaseConfigIssue,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase';

export interface SupabaseProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  account_status: 'pending' | 'active' | 'suspended' | 'banned';
  banned_until: string | null;
  ban_reason: string;
  suspended_until: string | null;
}

interface SupabaseContextValue {
  supabaseConfigured: boolean;
  configIssue: string | null;
  session: Session | null;
  user: User | null;
  profile: SupabaseProfileRow | null;
  authReady: boolean;
  passwordRecoveryMode: boolean;
  signInWithSupabase: (email: string, password: string) => Promise<{ session: Session; user: User }>;
  signUpWithSupabase: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{ session: Session | null; user: User | null; requiresEmailConfirmation: boolean }>;
  signOutSupabase: () => Promise<void>;
  sendPasswordResetSupabase: (email: string) => Promise<void>;
  updatePasswordSupabase: (newPassword: string) => Promise<void>;
  clearPasswordRecoveryMode: () => void;
  refreshProfile: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined);

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabaseConfigured = isSupabaseConfigured();
  const configIssue = getSupabaseConfigIssue();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SupabaseProfileRow | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(() => {
    try {
      return window.location.hash.includes('type=recovery');
    } catch {
      return false;
    }
  });

  const loadOwnProfile = useCallback(async (userId: string) => {
    if (!supabase || !userId) {
      setProfile(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, account_status, banned_until, ban_reason, suspended_until')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data) {
        setProfile(data as SupabaseProfileRow);
      }
    } catch {
      // Tabela pode ainda não estar migrada no projeto Supabase do utilizador
    }
  }, []);

  useEffect(() => {
    if (!supabase || !supabaseConfigured) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const activeSession = data.session ?? null;
        setSession(activeSession);
        setUser(activeSession?.user ?? null);
        if (activeSession?.user?.id) {
          void loadOwnProfile(activeSession.user.id);
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (mounted) setAuthReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setPasswordRecoveryMode(false);
      }
      if (nextSession?.user?.id) {
        void loadOwnProfile(nextSession.user.id);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabaseConfigured, loadOwnProfile]);

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) return;
    const channel = client
      .channel(`luandarp_realtime_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as SupabaseProfileRow | undefined;
          if (next?.id) {
            setProfile(next);
            window.dispatchEvent(new CustomEvent('luanda:supabase_profile_update', { detail: next }));
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        window.dispatchEvent(new CustomEvent('luanda:supabase_orgs_update'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_members' }, () => {
        window.dispatchEvent(new CustomEvent('luanda:supabase_orgs_update'));
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [user?.id]);

  const signInWithSupabase = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error(getSupabaseConfigIssue() || 'Supabase não configurado.');
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.session || !data.user) {
      throw new Error(formatSupabaseAuthError(error));
    }
    setSession(data.session);
    setUser(data.user);
    void loadOwnProfile(data.user.id);
    return { session: data.session, user: data.user };
  }, [loadOwnProfile]);

  const signUpWithSupabase = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!supabase) {
      throw new Error(getSupabaseConfigIssue() || 'Supabase não configurado.');
    }
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        data: {
          display_name: (displayName || cleanEmail.split('@')[0] || 'Cidadão').trim(),
        },
      },
    });
    if (error) {
      throw new Error(formatSupabaseAuthError(error));
    }
    if (data.session && data.user) {
      setSession(data.session);
      setUser(data.user);
      void loadOwnProfile(data.user.id);
    }
    return {
      session: data.session ?? null,
      user: data.user ?? null,
      requiresEmailConfirmation: Boolean(data.user && !data.session),
    };
  }, [loadOwnProfile]);

  const signOutSupabase = useCallback(async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setPasswordRecoveryMode(false);
  }, []);

  const sendPasswordResetSupabase = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error(getSupabaseConfigIssue() || 'Supabase não configurado.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) {
      throw new Error(formatSupabaseAuthError(error));
    }
  }, []);

  const updatePasswordSupabase = useCallback(async (newPassword: string) => {
    if (!supabase) {
      throw new Error(getSupabaseConfigIssue() || 'Supabase não configurado.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(formatSupabaseAuthError(error));
    }
    setPasswordRecoveryMode(false);
    try {
      if (window.location.hash.includes('type=recovery')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
  }, []);

  const clearPasswordRecoveryMode = useCallback(() => {
    setPasswordRecoveryMode(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadOwnProfile(user.id);
    }
  }, [user?.id, loadOwnProfile]);

  return (
    <SupabaseContext.Provider
      value={{
        supabaseConfigured,
        configIssue,
        session,
        user,
        profile,
        authReady,
        passwordRecoveryMode,
        signInWithSupabase,
        signUpWithSupabase,
        signOutSupabase,
        sendPasswordResetSupabase,
        updatePasswordSupabase,
        clearPasswordRecoveryMode,
        refreshProfile,
      }}
    >
      {children}
    </SupabaseContext.Provider>
  );
};

export function useSupabase(): SupabaseContextValue {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useSupabase deve ser utilizado dentro de SupabaseProvider');
  }
  return ctx;
}

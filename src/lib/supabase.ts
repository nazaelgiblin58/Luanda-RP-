/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://zoamzawcpoomqwmzvaxk.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_KEY = 'sb_publishable_qxvjzioRhdOaa-lUUi3qcg_nNmCwLXS';

const rawEnvUrl = (env.VITE_SUPABASE_URL || '').trim();
const rawUrl = rawEnvUrl && rawEnvUrl !== 'PROJECT_URL' && rawEnvUrl !== 'MY_SUPABASE_URL'
  ? rawEnvUrl
  : DEFAULT_PUBLIC_SUPABASE_URL;
const rawKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_PUBLIC_SUPABASE_KEY
).trim();

export function isValidSupabaseUrl(url: string): boolean {
  if (!url || url === 'PROJECT_URL' || url === 'MY_SUPABASE_URL') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const SUPABASE_URL = isValidSupabaseUrl(rawUrl) ? rawUrl.replace(/\/+$/, '') : '';
export const SUPABASE_PUBLISHABLE_KEY = rawKey;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseConfigIssue(): string | null {
  if (!SUPABASE_URL) {
    return 'A variável VITE_SUPABASE_URL tem um endereço inválido.';
  }
  if (!SUPABASE_PUBLISHABLE_KEY) {
    return 'A variável VITE_SUPABASE_PUBLISHABLE_KEY não está definida.';
  }
  return null;
}

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'luandarp_supabase_auth',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return clientInstance;
}

export const supabase = getSupabaseClient();

export function formatSupabaseAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();

  if (!isSupabaseConfigured() && lower.includes('supabase')) {
    return getSupabaseConfigIssue() || 'Ligação Supabase não configurada.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Email ou palavra-passe incorretos. Verifica os teus dados e tenta novamente.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Conta criada, mas o email ainda não foi confirmado. Verifica a tua caixa de entrada.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Já existe uma conta registada com este endereço de email.';
  }
  if (lower.includes('password should be at least') || lower.includes('weak password')) {
    return 'A palavra-passe é demasiado fraca. Utiliza pelo menos 6 caracteres.';
  }
  if (lower.includes('unable to validate email address') || lower.includes('invalid email')) {
    return 'O endereço de email introduzido não é válido.';
  }
  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit') || lower.includes('too many requests')) {
    return 'Demasiadas tentativas seguidas. Aguarda alguns instantes antes de tentar novamente.';
  }
  if (lower.includes('token has expired') || lower.includes('otp_expired') || lower.includes('link is invalid')) {
    return 'O link de recuperação ou verificação expirou. Solicita um novo email de recuperação.';
  }
  if (lower.includes('same_password') || lower.includes('new password should be different')) {
    return 'A nova palavra-passe deve ser diferente da palavra-passe atual.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('enotfound') ||
    lower.includes('name_not_resolved')
  ) {
    return `Não foi possível contactar o projeto Supabase (${SUPABASE_URL}). Verifica a ligação à internet e confirma se o Project URL do Supabase está exato.`;
  }
  return msg || 'Ocorreu um erro inesperado na autenticação.';
}

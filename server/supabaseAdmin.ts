/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyCredentials } from '@supabase/server/core';
import { fromSupabaseUrl } from '@supabase/server';

function cleanUrl(raw?: string): string {
  const v = (raw || '').trim();
  if (!v || v === 'PROJECT_URL' || v === 'MY_SUPABASE_URL') return '';
  try {
    const parsed = new URL(v);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return v.replace(/\/+$/, '');
    }
  } catch {}
  return '';
}

function isUsableSecretKey(raw?: string): boolean {
  const v = (raw || '').trim();
  if (!v || v.includes('•') || v.includes('...')) return false;
  return v.length >= 20;
}

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://zoamzawcpoomqwmzvaxk.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qxvjzioRhdOaa-lUUi3qcg_nNmCwLXS';

export function getServerSupabaseUrl(): string {
  return (
    cleanUrl(process.env.SUPABASE_URL) ||
    cleanUrl(process.env.VITE_SUPABASE_URL) ||
    DEFAULT_PUBLIC_SUPABASE_URL
  );
}

export function getServerSupabaseJwksUrl(): string {
  return (
    cleanUrl(process.env.SUPABASE_JWKS_URL) ||
    `${getServerSupabaseUrl()}/auth/v1/.well-known/jwks.json`
  );
}

export function getServerSupabaseServiceRoleKey(): string {
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (isUsableSecretKey(secretKey)) return secretKey;
  const legacyServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (isUsableSecretKey(legacyServiceKey)) return legacyServiceKey;
  return '';
}

export function getServerSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ).trim();
}

export function isSupabaseServerAuthConfigured(): boolean {
  const url = getServerSupabaseUrl();
  return Boolean(url && (getServerSupabaseServiceRoleKey() || getServerSupabasePublishableKey()));
}

export function isSupabaseDbSyncConfigured(): boolean {
  return Boolean(getServerSupabaseUrl() && getServerSupabaseServiceRoleKey());
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAdminKeySig = '';

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getServerSupabaseUrl();
  const serviceKey = getServerSupabaseServiceRoleKey();
  if (!url || !serviceKey) return null;

  const sig = `${url}|${serviceKey.slice(0, 12)}`;
  if (!cachedAdminClient || cachedAdminKeySig !== sig) {
    cachedAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedAdminKeySig = sig;
  }
  return cachedAdminClient;
}

export interface VerifiedSupabaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

export async function verifySupabaseAccessToken(accessToken: string): Promise<VerifiedSupabaseUser | null> {
  const token = String(accessToken || '').trim();
  if (!token || token.split('.').length !== 3) return null;

  const url = getServerSupabaseUrl();
  const apiKey = getServerSupabasePublishableKey();
  const jwksUrl = getServerSupabaseJwksUrl();

  // 1. Verificação criptográfica local via @supabase/server + JWKS oficial (ES256/RS256)
  if (!process.env.LUANDA_TEST_MODE && url && apiKey) {
    try {
      const { data: authData } = await verifyCredentials(
        { token, apikey: apiKey },
        {
          auth: 'user',
          issuer: fromSupabaseUrl(url),
          env: {
            url,
            publishableKeys: { default: apiKey },
            secretKeys: {},
            jwks: new URL(jwksUrl),
          },
        }
      );
      const email = String(authData?.userClaims?.email || authData?.jwtClaims?.email || '')
        .trim()
        .toLowerCase();
      const uid = String(authData?.userClaims?.id || authData?.jwtClaims?.sub || '').trim();
      if (uid && email) {
        const meta = (authData?.userClaims?.userMetadata || authData?.jwtClaims?.user_metadata || {}) as Record<
          string,
          unknown
        >;
        return {
          uid,
          email,
          emailVerified: Boolean(
            authData?.jwtClaims?.email_verified ?? meta?.email_verified ?? true
          ),
          displayName: typeof meta?.display_name === 'string' ? meta.display_name : undefined,
        };
      }
    } catch {
      // Fallback para verificação remota /auth/v1/user ou Admin API
    }
  }

  // 2. Fallback via Supabase Admin SDK (se SUPABASE_SECRET_KEY / SERVICE_ROLE_KEY estiver configurada)
  const admin = getSupabaseAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data?.user?.id && data.user.email) {
        return {
          uid: data.user.id,
          email: data.user.email.trim().toLowerCase(),
          emailVerified: Boolean(data.user.email_confirmed_at || data.user.confirmed_at),
          displayName:
            typeof data.user.user_metadata?.display_name === 'string'
              ? data.user.user_metadata.display_name
              : undefined,
        };
      }
    } catch {}
  }

  // 3. Fallback remoto oficial /auth/v1/user usando Publishable Key
  if (!url || !apiKey) return null;

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
      user_metadata?: { display_name?: string };
    };
    if (!user?.id || !user?.email) return null;
    return {
      uid: user.id,
      email: user.email.trim().toLowerCase(),
      emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
      displayName: typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : undefined,
    };
  } catch {
    return null;
  }
}

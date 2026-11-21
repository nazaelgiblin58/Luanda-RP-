/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { AdminRole } from '../src/game/types.ts';
import { getDb } from './db.ts';
import type { AccountRecord } from './db.ts';
import firebaseConfig from '../firebase-applet-config.json';
import { adminAuth } from '../src/lib/firebase-admin.ts';

const ROLE_WEIGHT: Record<AdminRole, number> = {
  player: 0,
  moderador: 1,
  administrador: 2,
  gestor: 3,
  admin_god: 4,
};

let cachedSecret: string | null = null;

function getAuthSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16) {
    return process.env.AUTH_SECRET;
  }
  const db = getDb();
  if (db.metaAuthSecret && db.metaAuthSecret.length >= 16) {
    cachedSecret = db.metaAuthSecret;
    return cachedSecret;
  }
  if (cachedSecret) return cachedSecret;

  const secretPath = path.resolve(process.cwd(), 'data', '.auth_secret');
  try {
    if (fs.existsSync(secretPath)) {
      cachedSecret = fs.readFileSync(secretPath, 'utf-8').trim();
      if (cachedSecret.length >= 16) {
        db.metaAuthSecret = cachedSecret;
        return cachedSecret;
      }
    }
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    cachedSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, cachedSecret, 'utf-8');
    db.metaAuthSecret = cachedSecret;
    return cachedSecret;
  } catch {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    db.metaAuthSecret = cachedSecret;
    return cachedSecret;
  }
}

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || 'nazaelgiblin58@gmail.com').trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface TokenPayload {
  accountId: string;
  email: string;
  exp: number;
}

export function signToken(account: AccountRecord): string {
  const payload: TokenPayload = {
    accountId: account.id,
    email: account.email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 dias
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as TokenPayload;
    if (!parsed.accountId || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveAccountRole(account: AccountRecord): AdminRole {
  if (account.email.toLowerCase() === getAdminEmail()) {
    account.role = 'admin_god';
    return 'admin_god';
  }
  return account.role || 'player';
}

export function hasMinRole(actual: AdminRole, required: AdminRole): boolean {
  return (ROLE_WEIGHT[actual] ?? 0) >= (ROLE_WEIGHT[required] ?? 0);
}

export interface AuthedRequest extends Request {
  account?: AccountRecord;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faz login novamente.' });
  }

  const db = getDb();
  const account = db.accounts[payload.accountId];
  if (!account) {
    return res.status(401).json({ error: 'Conta não encontrada.' });
  }

  resolveAccountRole(account);

  const now = Date.now();
  if (account.bannedUntil > now) {
    return res.status(403).json({
      error: `Conta banida até ${new Date(account.bannedUntil).toLocaleString('pt-PT')}. Motivo: ${account.banReason || 'Violação das regras RP'}`,
    });
  }
  if (account.suspendedUntil > now) {
    return res.status(403).json({
      error: `Conta suspensa temporariamente até ${new Date(account.suspendedUntil).toLocaleString('pt-PT')}.`,
    });
  }

  req.account = account;
  next();
}

export function requireRole(minRole: AdminRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const role = resolveAccountRole(req.account);
    if (!hasMinRole(role, minRole)) {
      return res.status(403).json({ error: `Acesso negado. Cargo mínimo exigido: ${minRole}.` });
    }
    next();
  };
}

// Rate limiter por conta/email/IP para evitar bloqueios injustos em redes partilhadas (NAT/Wi-Fi)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests = 45, windowMs = 15000) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const ip = req.ip || 'local';
    const rawEmail =
      typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
        ? String((req.body as { email?: string }).email).trim().toLowerCase().slice(0, 80)
        : '';
    const identity = req.account?.id ? `acc:${req.account.id}` : rawEmail ? `ip:${ip}:mail:${rawEmail}` : `ip:${ip}`;
    const route = `${req.baseUrl}${req.path}`;
    const key = `${identity}:${route}`;
    const now = Date.now();
    if (rateBuckets.size > 4000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (now > v.resetAt) rateBuckets.delete(k);
      }
    }
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({ error: 'Muitas ações rápidas seguidas. Aguarda alguns segundos.' });
    }
    next();
  };
}

function getFirebaseProjectId(): string {
  return firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || '';
}

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;
async function getGoogleSecureTokenCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Falha ao obter certificados públicos do Firebase Auth.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;
  const certs = (await resp.json()) as Record<string, string>;
  cachedCerts = { certs, expiresAt: now + maxAgeMs };
  return certs;
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const tokenStr = String(idToken || '').trim();
  if (!tokenStr) {
    throw new Error('Token Firebase inválido.');
  }
  try {
    const decoded = await adminAuth.verifyIdToken(tokenStr);
    if (!decoded.email || decoded.email_verified !== true) {
      throw new Error('A conta Google precisa de ter o email verificado.');
    }
    return {
      uid: decoded.uid,
      email: decoded.email.trim().toLowerCase(),
      emailVerified: true,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
    };
  } catch (adminErr) {
    if (adminErr instanceof Error && adminErr.message.includes('email verificado')) {
      throw adminErr;
    }
  }

  const parts = tokenStr.split('.');
  if (parts.length !== 3) {
    throw new Error('Token Firebase inválido.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  const projectId = getFirebaseProjectId();
  if (!projectId) {
    throw new Error('Projeto Firebase não configurado no servidor.');
  }
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Cabeçalho de token Firebase não suportado.');
  }
  const certs = await getGoogleSecureTokenCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Certificado de assinatura Firebase não encontrado.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureOk = verifier.verify(certPem, Buffer.from(sigB64, 'base64url'));
  if (!signatureOk) {
    throw new Error('Assinatura criptográfica do token Firebase inválida.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec
  ) {
    throw new Error('Token Firebase expirado ou inválido para este projeto.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('A conta Google precisa de ter o email verificado.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: payload.name,
  };
}


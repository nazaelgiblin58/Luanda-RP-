/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerApiRoutes } from './server/apiRoutes.ts';
import { getConnectedCount, initWebSocketServer } from './server/wsHandler.ts';
import { flushSqlSync, hydrateDbFromSqlIfNeeded, saveDb } from './server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseAllowedOrigins(): string[] {
  const raw = [
    process.env.ALLOWED_ORIGINS || '',
    process.env.FRONTEND_URL || '',
    process.env.APP_URL || '',
  ]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s && !s.startsWith('MY_'));
}

function isOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (hostHeader) {
    if (cleanOrigin === `http://${hostHeader}` || cleanOrigin === `https://${hostHeader}`) {
      return true;
    }
  }
  const allowlist = parseAllowedOrigins();
  if (allowlist.length === 0) {
    return true;
  }
  if (allowlist.includes('*') || allowlist.includes(cleanOrigin)) {
    return true;
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)
  ) {
    return true;
  }
  return false;
}

export function createLuandaServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, done) => {
      const origin = info.origin || info.req.headers.origin;
      const host = info.req.headers.host;
      if (!isOriginAllowed(origin, host)) {
        done(false, 403, 'Origem WebSocket não autorizada.');
        return;
      }
      done(true);
    },
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'microphone=(self)');

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (origin) {
      if (!isOriginAllowed(origin, req.headers.host)) {
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({ error: 'Origem CORS não autorizada.' });
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: 'luanda-rp',
      status: 'online',
      activeCitizens: getConnectedCount(),
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await hydrateDbFromSqlIfNeeded();
    } catch {}
    next();
  });

  registerApiRoutes(app);
  initWebSocketServer(wss);

  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof (err as { status?: number })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message =
      status === 400
        ? 'Pedido JSON inválido.'
        : 'Erro interno do servidor. Tenta novamente em instantes.';
    if (status >= 500) {
      console.error('[LUANDA RP 🇦🇴] Erro HTTP:', err);
    }
    res.status(status).json({ error: message });
  });

  return { app, server, wss };
}

function resolveDistDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '..', 'dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || candidates[0];
}

async function setupServer() {
  const { app, server, wss } = createLuandaServer();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = resolveDistDir();
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '7d',
        immutable: true,
      })
    );
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LUANDA RP 🇦🇴] Servidor a correr na porta ${PORT}`);
  });

  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[LUANDA RP 🇦🇴] A encerrar servidor (${signal})...`);
    try {
      await saveDb();
      await flushSqlSync();
    } catch {}
    wss.close(() => {
      server.close(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 4000).unref();
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[LUANDA RP 🇦🇴] UnhandledRejection:', reason);
  });
}

if (!process.env.LUANDA_TEST_MODE) {
  setupServer();
}

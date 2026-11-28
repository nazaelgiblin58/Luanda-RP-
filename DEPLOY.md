# Guia de Deploy — LUANDA RP 🇦🇴

O **LUANDA RP** utiliza uma arquitetura segura preparada para produção:

1. **Frontend Estático (React + Three.js + Vite)** → **Netlify** (`dist/`)
2. **Autenticação & PostgreSQL Persistente + Realtime + RLS** → **Supabase**
3. **Servidor Autoritativo Multiplayer (Express + WebSocket `/ws`)** → **Host Node.js persistente** (Railway, Render, Fly.io ou VPS)

> **Importante:** O Netlify serve apenas o frontend estático (`dist/`) e não mantém servidores WebSocket contínuos. Por isso, a autenticação usa **Supabase Auth** diretamente no cliente, e o mundo multiplayer em tempo real liga-se ao backend Node + `/ws` via HTTPS e WSS.

---

## 1. Configuração do Supabase

1. Cria ou abre o teu projeto no painel do **Supabase**.
2. Em **SQL Editor**, executa integralmente a migração `supabase/migrations/001_luandarp_schema.sql` para criar:
   - Todas as tabelas (`profiles`, `characters`, `player_stats`, `player_inventory`, `player_vehicles`, `organizations`, `organization_members`, `factions`, `player_properties`, `player_money_transactions`, `admin_logs`);
   - O gatilho `on_auth_user_created` que cria automaticamente um `profile` permanente para cada novo utilizador;
   - Políticas **RLS** rigorosas e publicação **Supabase Realtime**.
3. Em **Authentication → URL Configuration**:
   - Define **Site URL** com o domínio do Netlify (ex.: `https://luandarp.netlify.app`).
   - Adiciona em **Redirect URLs** o mesmo URL (e `http://localhost:3000` para desenvolvimento) para que a recuperação de palavra-passe funcione sem erros.
4. Copia a **Project URL** (`https://xxxx.supabase.co`) e a **service_role key** (apenas para o servidor Node.js, nunca para o frontend).

---

## 2. Deploy do Backend (Node.js + Express + WebSocket)

1. Configura um serviço Node.js 20+ com volume persistente (ex.: `/data`).
2. Comandos:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
   - **Healthcheck HTTP:** `/api/health`
3. Variáveis de ambiente no backend:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `AUTH_SECRET=<chave-secreta-aleatoria-com-32+-caracteres>`
   - `ADMIN_EMAIL=nazaelgiblin58@gmail.com`
   - `LUANDA_DB_PATH=/data/luandarp_db.json`
   - `SUPABASE_URL=https://zoamzawcpoomqwmzvaxk.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY=sb_publishable_qxvjzioRhdOaa-lUUi3qcg_nNmCwLXS`
   - `SUPABASE_SECRET_KEY=<chave-secreta-sb_secret_...-completa-do-supabase>`
   - `SUPABASE_JWKS_URL=https://zoamzawcpoomqwmzvaxk.supabase.co/auth/v1/.well-known/jwks.json`
   - `FRONTEND_URL=https://O-TEU-SITE.netlify.app`
   - `ALLOWED_ORIGINS=https://O-TEU-SITE.netlify.app`

---

## 3. Deploy do Frontend no Netlify

1. O ficheiro `netlify.toml` já está configurado:
   - `command = "npm run build"`
   - `publish = "dist"`
   - Redirecionamento SPA `/* -> /index.html` (`200`)
2. No painel do Netlify (**Site configuration → Environment variables**), define:
   - `VITE_SUPABASE_URL=https://zoamzawcpoomqwmzvaxk.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_qxvjzioRhdOaa-lUUi3qcg_nNmCwLXS`
   - `VITE_API_BASE_URL=https://api-do-teu-backend.onrender.com`
   - `VITE_WS_URL=wss://api-do-teu-backend.onrender.com/ws`
3. Faz o redeploy no Netlify após gravar as variáveis para o Vite compilar o `dist/` atualizado.

> **Segurança:** Nunca coloques `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_*` nem no Netlify frontend.

---

## 4. Verificação Pós-Deploy

1. Acede a `https://api-do-teu-backend.../api/health` e confirma `{ "ok": true, "service": "luanda-rp", "status": "online" }`.
2. Abre o site no Netlify, cria uma conta, confirma sessão persistente após refresh, testa recuperação de palavra-passe, criação de personagem e sincronização multiplayer entre dois browsers.

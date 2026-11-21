# Guia de Deploy — LUANDA RP 🇦🇴

O **LUANDA RP** utiliza uma arquitetura separada ideal para produção:

1. **Frontend Estático (React + Three.js + Vite)** → **Netlify** (`dist/`)
2. **Backend Autoritativo (Express + WebSocket + Base de Dados)** → **Host Node.js persistente** (Railway, Render, Fly.io ou VPS com disco)

> **Importante:** O Netlify serve apenas ficheiros estáticos e não mantém servidores WebSocket contínuos. Por isso, o backend Node + `/ws` corre num servidor dedicado e o frontend liga-se a ele via HTTPS e WSS.

---

## 1. Deploy do Backend (Node.js + Express + WebSocket)

1. Configura um serviço Node.js 20+ com armazenamento persistente montado (por exemplo `/data`).
2. Comandos do serviço:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start` (executa `node dist-server/server.mjs`)
   - **Healthcheck HTTP:** `/api/health`
3. Variáveis de ambiente obrigatórias no backend:
   - `NODE_ENV=production`
   - `PORT=3000` (ou a porta atribuída pelo provedor)
   - `AUTH_SECRET=<chave-secreta-aleatoria-com-32+-caracteres>`
   - `ADMIN_EMAIL=nazaelgiblin58@gmail.com`
   - `LUANDA_DB_PATH=/data/luandarp_db.json` (garante persistência entre restarts)
   - `FRONTEND_URL=https://O-TEU-SITE.netlify.app`
   - `ALLOWED_ORIGINS=https://O-TEU-SITE.netlify.app` (se tiveres domínio próprio, adiciona separado por vírgula: `https://O-TEU-SITE.netlify.app,https://luandarp.ao`)

---

## 2. Deploy do Frontend no Netlify

1. O ficheiro `netlify.toml` já está configurado:
   - `command = "npm run build"`
   - `publish = "dist"`
   - Redirecionamento SPA `/* -> /index.html` (`200`)
2. No painel do Netlify (**Site configuration → Environment variables**), define:
   - `VITE_API_BASE_URL=https://api-do-teu-backend.onrender.com`
   - `VITE_WS_URL=wss://api-do-teu-backend.onrender.com/ws`
3. Faz o redeploy após definir as variáveis para que o Vite as incorpore no bundle `dist/`.

---

## 3. Verificação Pós-Deploy

1. Acede a `https://api-do-teu-backend.../api/health` e confirma `{ "ok": true, "service": "luanda-rp", "status": "online" }`.
2. Abre o site no Netlify, entra com a conta, cria/seleciona personagem e confirma que a ligação WebSocket estabelece sem erros de CORS/Origin e que dois jogadores em browsers diferentes se veem no mesmo mundo.

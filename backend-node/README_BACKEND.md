# Backend Node - R2R CRM

Aplicacao Node.js oficial do CRM.

Comandos:

```bash
npm install
cp .env.example .env
npm start
```

Health check:

```bash
curl http://localhost:3000/health
```

Em producao, preencha `.env` no painel do EasyPanel/VPS/Render/Railway. Nao publique `.env` real no GitHub.

Rotas principais para validar:

- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/leads`
- `GET /api/contatos`
- `GET /api/atendimentos`
- `POST /api/messages/send`
- `POST /api/webhooks/evolution`
- `POST /api/files/upload`
- `GET /api/reports/dashboard`
- `GET /api/google/status`

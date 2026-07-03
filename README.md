# R2R CRM SaaS

Versao oficial limpa do CRM R2R para producao no EasyPanel/VPS.

- Backend Node: `backend-node/`
- Frontend Hostinger/public_html: `frontend-public_html/`
- Supabase SQL: `supabase/`
- Documentacao: `docs/`

## Deploy EasyPanel

Configure o EasyPanel para publicar este repositorio pela **raiz** como aplicacao Node/Docker, nunca como Static Site.

- Branch: `main`
- Dockerfile: `Dockerfile` na raiz
- Node: `20.x`
- Start command: `npm start`
- Porta interna: `3000`
- Host: `0.0.0.0`
- Health check: `/api/health`

Se `https://crm.r2rmarketingdigital.com.br/api/health` retornar HTML em vez de JSON, o dominio ainda esta apontado para um deploy estatico/antigo e nao para este backend Node.

O backend da raiz serve o frontend correto de `frontend-public_html/`, injeta as variaveis publicas no navegador e mantem as rotas `/health`, `/api/health`, `/api/auth/*`, `/api/leads`, `/api/clientes`, `/api/tarefas`, `/api/mensagens`, `/api/dashboard` e `/api/integrations/evolution/*`.

# R2R CRM SaaS

Versao oficial limpa do CRM R2R para producao no EasyPanel/VPS.

- Backend Node: `backend-node/`
- Frontend Hostinger/public_html: `frontend-public_html/`
- Supabase SQL: `supabase/`
- Documentacao: `docs/`

## Deploy EasyPanel

Configure o EasyPanel para publicar este repositorio pela **raiz** como aplicacao Docker/Node, nunca como Static Site.

- Branch: `main` ou branch de correcao antes do merge
- Build path: `/`
- Dockerfile: `Dockerfile` na raiz
- Node: `20.x`
- Start command: `npm start`
- Porta interna: `3333`
- Host: `0.0.0.0`
- Health check: `/api/health`

Se `https://api.seudominio.com.br/api/health` retornar HTML em vez de JSON, o dominio ainda esta apontado para um deploy estatico/antigo e nao para este backend Node.

## Supabase/Auth

O backend usa Supabase Auth para login e `public.usuarios` para perfil/permissao. Em producao, configure obrigatoriamente no EasyPanel:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`
- `AUTO_LINK_AUTH_PROFILE=true`

Com `AUTO_LINK_AUTH_PROFILE=true`, quando o login no Supabase Auth for valido e existir exatamente um registro em `public.usuarios` com o mesmo e-mail e `auth_user_id` vazio, o backend vincula automaticamente o `auth_user_id`. Isso corrige o caso em que o usuario autentica, mas o CRM fica sem perfil/permissao.

## Frontend/API

O arquivo `frontend-public_html/config.js` nao trava mais a API em uma URL fixa. A ordem agora e:

1. `window.R2R_API_BASE`, se injetado pelo backend;
2. URL salva em `localStorage` pelo painel de testes;
3. deteccao automatica do bridge, incluindo `crm.seudominio.com.br` -> `api.seudominio.com.br`.

## Evolution API

Configure as variaveis somente no backend/EasyPanel:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_INSTANCE`
- `EVOLUTION_INSTANCE_API_KEY`, se sua Evolution v2 exigir chave por instancia
- `EVOLUTION_FORCE_ENV_CREDENTIALS=true`, para priorizar as credenciais do EasyPanel sobre chaves antigas salvas no banco

Teste rapido depois do deploy:

```txt
/api/health
/api/health?probe=evolution
/api/config
```

O backend da raiz serve o frontend correto de `frontend-public_html/`, injeta as variaveis publicas no navegador e mantem as rotas `/health`, `/api/health`, `/api/auth/*`, `/api/leads`, `/api/clientes`, `/api/tarefas`, `/api/mensagens`, `/api/reports/dashboard` e `/api/integrations/evolution/*`.

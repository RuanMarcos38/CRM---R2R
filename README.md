# R2R CRM SaaS

Versao oficial do CRM R2R para producao no EasyPanel/VPS.

- Backend Node: `backend-node/`
- Frontend servido pelo backend: `frontend-public_html/`
- Supabase SQL: `supabase/`
- Documentacao: `docs/`

## Deploy oficial no EasyPanel

Publique este repositorio pela **raiz** como uma aplicacao App/Node/Docker. Nao use Static Site.

- Repositorio: `RuanMarcos38/CRM---R2R`
- Branch: `main`
- Build path: `/`
- Build method: `Dockerfile`
- Dockerfile path: `Dockerfile`
- Start command: usar o `CMD` do Dockerfile (`npm start`)
- Porta interna/proxy: `3000`
- Host interno: `0.0.0.0`
- Health check: `/api/health`
- Dominio principal do CRM/API: `crm.r2rmarketingdigital.com.br`
- Subdominio opcional de API: somente use `api.r2rmarketingdigital.com.br` se ele apontar para este mesmo app Node
- Protocolo entre proxy e container: `HTTP`
- HTTPS publico: Let's Encrypt automatico do EasyPanel

O EasyPanel deve ter **Auto Deploy** ativado depois que o servico estiver funcionando. Assim, cada push na branch `main` inicia um novo deploy.

## Variaveis publicas de producao

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_DIR=/app/frontend-public_html
APP_URL=https://crm.r2rmarketingdigital.com.br
PUBLIC_URL=https://crm.r2rmarketingdigital.com.br
FRONTEND_URL=https://crm.r2rmarketingdigital.com.br
CORS_ORIGIN=https://crm.r2rmarketingdigital.com.br
ALLOW_DEMO_AUTH=false
ALLOW_EMAIL_PROFILE_LINK=false
ALLOW_GLOBAL_INTEGRATION_FALLBACK=false
```

As chaves reais de Supabase, OpenAI, Evolution, Meta, Google e n8n devem ficar exclusivamente nas variaveis de ambiente do EasyPanel. Nunca versione o arquivo `.env` real.

## Testes de producao

A API correta deve retornar JSON:

```text
https://crm.r2rmarketingdigital.com.br/api/health
https://crm.r2rmarketingdigital.com.br/api/config
```

Para testar certificado SSL e resposta da API pelo terminal:

```bash
npm run check:production
```

O comando falha quando o certificado nao e confiavel, quando `/api/health` retorna HTML ou quando o backend nao responde com `ok: true`.

## SSL e dominio

O DNS do dominio `crm.r2rmarketingdigital.com.br` deve apontar para o servico Node do EasyPanel, com proxy para a porta `3000`, protocolo interno HTTP e Let's Encrypt ativado. A rota `https://crm.r2rmarketingdigital.com.br/api/health` precisa retornar JSON. Se retornar HTML, o dominio ainda esta servindo uma hospedagem estatica antiga em vez do backend.

Nao use `api.r2rmarketingdigital.com.br` como URL do backend enquanto ele nao apontar para o mesmo servico Node. Se o subdominio separado for reativado, ele tambem deve responder `/api/health` com JSON antes de ser salvo no CRM.

O backend da raiz serve o frontend correto de `frontend-public_html/`, injeta as configuracoes publicas no navegador e mantem as rotas `/health`, `/api/health`, `/api/auth/*`, `/api/leads`, `/api/clientes`, `/api/tarefas`, `/api/mensagens`, `/api/reports/dashboard`, `/api/meta/*` e `/api/integrations/evolution/*`.

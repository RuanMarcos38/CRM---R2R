# README de Instalacao Final - R2R CRM SaaS

## Estrutura da entrega

```text
ENTREGA_FINAL_CRM_R2R/
  frontend-public_html/
    index.html
    config.js
    assets/
    .htaccess
  backend-node/
    package.json
    server.js
    src/
    tests/
    .env.example
    Dockerfile
  supabase/
    migrations/
      001_schema.sql
    seed.sql
  docs/
    AUDITORIA_FINAL.md
    README_INSTALACAO_FINAL.md
    CHECKLIST_PRODUCAO_FINAL.md
```

## 1. Preparar Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute todo o arquivo `supabase/migrations/001_schema.sql`.
4. Em Authentication, crie um usuario admin.
5. Por padrao o seed usa `admin@r2rmarketingdigital.com.br`. Altere `supabase/seed.sql` antes de executar se quiser outro e-mail.
6. Execute `supabase/seed.sql`.
7. Confirme que existe um registro em `public.usuarios` com o mesmo e-mail do usuario criado no Supabase Auth.

Nao coloque senha real no SQL. A senha deve ser criada/alterada no painel de Authentication do Supabase.

## 2. Preparar backend Node

Entre na pasta `backend-node`.

```bash
cp .env.example .env
npm install
npm start
```

Configure o `.env` real:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://api.seudominio.com.br
FRONTEND_URL=https://crm.seudominio.com.br
PUBLIC_URL=https://api.seudominio.com.br
CORS_ORIGIN=https://crm.seudominio.com.br

SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

EVOLUTION_API_URL=https://evolution.seudominio.com.br
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=r2r-crm
```

Teste:

```bash
curl https://api.seudominio.com.br/health
```

A resposta esperada contem:

```json
{
  "ok": true,
  "status": "online"
}
```

## 3. Deploy backend no EasyPanel/VPS

Use a pasta `backend-node` como aplicacao Node.

- Build/install: `npm install`
- Start command: `npm start`
- Porta: `3000`
- Health check: `/health`
- Variaveis: copie do `.env.example` e preencha no painel.

Com Docker:

```bash
docker build -t r2r-crm-backend .
docker run -p 3000:3000 --env-file .env r2r-crm-backend
```

## 4. Deploy frontend na Hostinger public_html

Envie para `public_html` apenas o conteudo de `frontend-public_html`:

- `index.html`
- `config.js`
- `assets/`
- `.htaccess`

Edite `frontend-public_html/config.js` antes de enviar:

```js
window.R2R_CONFIG = Object.assign({
  API_BASE_URL: 'https://api.seudominio.com.br',
  APP_NAME: 'R2R CRM',
  ENV: 'production',
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sua-chave-publica'
}, window.R2R_CONFIG || {});
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, Evolution API Key, OpenAI Key, Meta Token ou N8N Key no frontend.

## 5. Testar login

1. Abra o CRM no dominio do frontend.
2. Entre com o usuario criado no Supabase Auth.
3. Se o login autenticar mas o backend retornar perfil ausente, confira se `public.usuarios.email` e igual ao e-mail do Auth.

## 6. Configurar Evolution API

No backend `.env`:

```env
EVOLUTION_API_URL=https://evolution.seudominio.com.br
EVOLUTION_API_KEY=sua-chave-global
EVOLUTION_INSTANCE=r2r-crm
```

No CRM:

1. Acesse Ajustes.
2. Abra Integracoes/WhatsApp.
3. Informe URL, API Key e nome da instancia.
4. Clique em Salvar.
5. Clique em Conectar.
6. O backend chama a Evolution API e retorna `qrCode`.
7. Escaneie o QR Code pelo WhatsApp.
8. Clique em Verificar para conferir status.

Se a Evolution nao estiver configurada, a API retorna erro amigavel:

```json
{
  "ok": true,
  "success": false,
  "configured": false,
  "status": "not_configured"
}
```

## 7. Comandos de validacao

Em ambiente com Node.js 18+:

```bash
cd backend-node
npm test
node --check server.js
```

Rotas importantes:

- `GET /health`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/leads`
- `GET /api/contacts`
- `GET /api/integrations/evolution/status`
- `POST /api/integrations/evolution/connect`
- `GET /api/integrations/evolution/qrcode`
- `POST /api/messages/send`
- `GET /api/reports/dashboard`

## 8. Onde importar cada parte

- Hostinger `public_html`: conteudo de `frontend-public_html`.
- EasyPanel/VPS/Render/Railway: pasta `backend-node`.
- Supabase SQL Editor: `supabase/migrations/001_schema.sql`, depois `supabase/seed.sql`.
- Documentacao operacional: pasta `docs`.

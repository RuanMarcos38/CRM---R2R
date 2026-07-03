# Auditoria Final - R2R CRM SaaS

Data da entrega: 2026-07-02

## Versao oficial

- Frontend oficial: `frontend-public_html/index.html`, `frontend-public_html/config.js` e `frontend-public_html/assets/crm-saas-bridge.js`.
- Backend oficial: `backend-node/server.js` com modulos em `backend-node/src/`.
- Banco oficial: `supabase/migrations/001_schema.sql` e `supabase/seed.sql`.
- Documentacao oficial: pasta `docs/`.

## Problemas encontrados

- O pacote original tinha varias versoes concorrentes na raiz, em `Codex/`, em `01_FRONTEND_PUBLIC_HTML_SEM_ALTERAR_LAYOUT`, em `02_BACKEND_EASYPANEL_NODE` e em arquivos soltos como `r2r-v8`, `r2r-v9`, `r2r-backend-v10`, `r2r-login-fix` e `r2r-core-fix`.
- O frontend possuia muitos patches inline competindo entre si e chamadas diretas para Evolution API, Meta, N8N e Supabase.
- O backend Node puro existia, mas nao expunha todos os nomes de rotas pedidos no contrato final.
- O health check principal estava em `/healthz` e `/api/health`; a rota `/health` nao existia.
- O frontend nao carregava `config.js` como arquivo oficial, apesar de o deploy em Hostinger depender dele.
- `config.js` nao expunha `window.R2R_CONFIG` no formato pedido.
- A configuracao da Evolution usava principalmente `EVOLUTION_URL`; o contrato final exige `EVOLUTION_API_URL`.
- A resposta do QR Code nao estava padronizada com `qrCode`, `status`, `instance` e `success`.
- O schema SQL tinha as tabelas centrais, RLS e indices, mas nao tinha uma view de dashboard explicita para relatorios.
- Os testes eram apenas unitarios e nao subiam o servidor para validar rotas reais.

## Correcoes aplicadas

- Criada entrega final limpa em `ENTREGA_FINAL_CRM_R2R`, sem scripts antigos concorrentes.
- Mantido o layout do CRM; as alteracoes no frontend foram de configuracao e integracao.
- Adicionado carregamento oficial de `config.js` antes do script inline do `index.html`.
- Adicionado `window.R2R_CONFIG` com `API_BASE_URL`, `APP_NAME`, `ENV`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
- Ajustado fallback local do frontend para `localhost:3000`.
- Criada funcao `checkBackendHealth()` no bridge do frontend.
- Backend alinhado para porta padrao `3000`.
- Adicionadas rotas publicas:
  - `GET /health`
  - `GET /healthz`
  - `GET /api/health`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
- Adicionadas rotas protegidas/aliases:
  - `GET /api/me`
  - `GET /api/settings`
  - `PUT /api/settings`
  - `GET /api/contacts`
  - `GET /api/messages`
  - `POST /api/messages/send`
  - `GET /api/reports/dashboard`
  - `GET /api/integrations`
  - `GET /api/integrations/evolution`
  - `POST /api/integrations/evolution`
  - `GET /api/integrations/evolution/status`
  - `POST /api/integrations/evolution/connect`
  - `GET /api/integrations/evolution/qrcode`
  - `POST /api/integrations/evolution/disconnect`
- Mantidas rotas antigas para compatibilidade:
  - `/api/integrations/whatsapp`
  - `/api/whatsapp/status`
  - `/api/whatsapp/connect`
  - `/api/whatsapp/disconnect`
  - `/api/whatsapp/send`
- Ajustada Evolution API para aceitar `EVOLUTION_API_URL` e `EVOLUTION_URL`.
- Padronizada resposta de QR Code com `qrCode`, `qrcode`, `qr`, `status`, `instance`, `success`, `configured` e `raw`.
- Ajustado erro amigavel quando Evolution API nao esta configurada.
- Adicionado login via Supabase Auth quando `SUPABASE_URL` e chave publica estao configuradas.
- Mantido modo demo local apenas fora de producao ou quando `ALLOW_DEMO_AUTH=true`.
- Adicionada view `public.dashboard_resumo` com `security_invoker = true`.
- Atualizado `.env.example` com variaveis de deploy, Supabase, JWT futuro e Evolution API.
- Atualizado `Dockerfile` para expor a porta 3000.
- Reescritos testes para cobrir servidor HTTP, health, login, rotas protegidas, aliases e Evolution sem configuracao.

## Decisoes tecnicas

- A versao oficial do backend ficou no Node puro ja existente, porque nao exige dependencias externas e facilita deploy em EasyPanel/VPS.
- O backend Express antigo dentro de `02_BACKEND_EASYPANEL_NODE` nao foi usado como oficial por trazer dependencias, encoding quebrado e um contrato diferente.
- O frontend foi preservado visualmente. A correcao foi feita pela camada `crm-saas-bridge.js`, que direciona operacoes sensiveis para o backend.
- Segredos da Evolution, Meta, OpenAI e N8N devem ficar no backend, nunca no frontend.
- O banco usa `clientes` como tabela oficial para contatos/clientes; o backend oferece alias REST `/api/contacts`.
- O banco usa `mensagens` como tabela oficial; o backend oferece alias REST `/api/messages`.

## Pendencias externas

- Criar projeto Supabase real.
- Executar `supabase/migrations/001_schema.sql`.
- Criar usuario no Supabase Auth com o e-mail desejado.
- Executar `supabase/seed.sql` ou ajustar o e-mail antes.
- Preencher `.env` real no backend.
- Configurar Evolution API real e obter API Key.
- Publicar backend Node em EasyPanel/VPS/Render/Railway.
- Publicar frontend estatico na Hostinger `public_html`.
- Ajustar `frontend-public_html/config.js` com a URL publica do backend.

## Observacao de teste local

Nao foi possivel executar `node --check` nem `npm test` nesta sessao porque `node` e `npm` nao estao instalados/disponiveis no PATH do ambiente Windows. Os comandos finais estao preparados e documentados para execucao no servidor ou maquina com Node.js 18+.

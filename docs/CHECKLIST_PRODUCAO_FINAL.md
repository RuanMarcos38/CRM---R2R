# Checklist de Producao Final - R2R CRM SaaS

## Supabase

- [ ] Projeto Supabase criado.
- [ ] `supabase/migrations/001_schema.sql` executado sem erro.
- [ ] `supabase/seed.sql` executado ou ajustado para o e-mail admin real.
- [ ] Usuario admin criado no Supabase Auth.
- [ ] Registro correspondente existe em `public.usuarios`.
- [ ] RLS habilitado nas tabelas operacionais.
- [ ] View `public.dashboard_resumo` criada com `security_invoker`.
- [ ] Views `public.contatos`, `public.atendimentos` e `public.logs` criadas com `security_invoker`.
- [ ] Policies de escrita validam perfil ativo e policies administrativas exigem admin/gestor/super_admin.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` fica somente no backend.
- [ ] Chave publica fica somente em `config.js` quando necessaria.

## Backend

- [ ] Node.js 18+ disponivel.
- [ ] `npm install` executado.
- [ ] `.env` criado a partir de `.env.example`.
- [ ] `NODE_ENV=production`.
- [ ] `PORT=3000` ou porta definida pelo provedor.
- [ ] Dominio de API aponta para o backend Node: `https://api.r2rmarketingdigital.com.br`.
- [ ] `https://api.r2rmarketingdigital.com.br/health` retorna JSON, nao HTML nem 502.
- [ ] O dominio do frontend `https://crm.r2rmarketingdigital.com.br` nao deve responder `/api/*` com `index.html`.
- [ ] `SUPABASE_URL` configurado.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurado no backend.
- [ ] `CORS_ORIGIN` aponta para o dominio real do frontend.
- [ ] `/health` retorna `status: online`.
- [ ] `/api/auth/login` autentica usuario real.
- [ ] `/api/me` retorna perfil e `empresa_id`.
- [ ] `/api/leads` retorna somente dados da empresa do usuario.
- [ ] `/api/contacts` responde.
- [ ] `/api/contatos` responde.
- [ ] `/api/atendimentos` responde.
- [ ] `/api/messages` responde.
- [ ] `/api/reports/dashboard` responde.
- [ ] `/api/files/upload` valida tipo/tamanho e cria registro em `arquivos`.
- [ ] `/api/google/status` responde com configuracao atual.
- [ ] Logs nao exibem segredos.
- [ ] `ALLOW_DEMO_AUTH=false` em producao.

## Frontend

- [ ] Arquivos de `frontend-public_html` enviados para `public_html`.
- [ ] `config.js` aponta para `https://api.r2rmarketingdigital.com.br`.
- [ ] Limpar `localStorage.r2r_api_base` no navegador se ele ficou salvo como `https://crm.r2rmarketingdigital.com.br`.
- [ ] `index.html` carrega sem tela quebrada.
- [ ] `checkBackendHealth()` retorna backend online.
- [ ] Login abre o painel do CRM.
- [ ] Area de integracoes aparece em Ajustes.
- [ ] Campos da Evolution API aparecem.
- [ ] Botao Salvar chama o backend.
- [ ] Botao Conectar chama o backend.
- [ ] QR Code aparece ou erro amigavel e exibido.
- [ ] Nenhuma chave secreta real foi colocada no frontend.

## Evolution API / WhatsApp

- [ ] Evolution API online.
- [ ] `EVOLUTION_API_URL` configurado no backend.
- [ ] `EVOLUTION_API_URL` com protocolo `https://` e dominio resolvendo DNS.
- [ ] `EVOLUTION_API_KEY` configurado no backend.
- [ ] `EVOLUTION_INSTANCE_NAME` definido.
- [ ] `EVOLUTION_WEBHOOK_SECRET` definido ou API key interna configurada para webhook.
- [ ] `EVOLUTION_WEBHOOK_EMPRESA_ID` definido quando a instancia nao estiver salva em `integracoes`.
- [ ] `/api/integrations/evolution/status` responde.
- [ ] `/api/integrations/evolution/connect` gera QR Code ou erro amigavel.
- [ ] URL publica da Evolution testada fora do CRM; erro de DNS/host invalido precisa ser corrigido no EasyPanel antes do QR Code.
- [ ] `/api/webhooks/evolution` recebe mensagem de teste e grava `conversas`, `mensagens` e `webhooks_logs`.
- [ ] WhatsApp escaneia o QR Code.
- [ ] Status muda para conectado.
- [ ] Envio de mensagem testado por `/api/messages/send`.

## Deploy e dominio

- [ ] Backend publicado em EasyPanel/VPS/Render/Railway ou ambiente Node equivalente.
- [ ] Frontend publicado na Hostinger ou hospedagem estatica.
- [ ] SSL ativo no frontend.
- [ ] SSL ativo no backend.
- [ ] Dominio/subdominio do backend configurado.
- [ ] Dominio/subdominio do frontend configurado.
- [ ] CORS validado entre frontend e backend.
- [ ] Health check do provedor aponta para `/health`.

## Testes

- [ ] `node --check server.js` executado com sucesso.
- [ ] `npm test` executado com sucesso.
- [ ] Login real testado.
- [ ] Listagem de leads testada.
- [ ] Listagem de contatos testada.
- [ ] Painel de integracoes testado.
- [ ] QR Code testado.
- [ ] Upload de arquivo permitido testado.
- [ ] Webhook Evolution testado.
- [ ] OpenAI testado por `/api/ai/test` quando `OPENAI_API_KEY` existir.
- [ ] Meta/Google permanecem sem credenciais no frontend.
- [ ] Logout testado.
- [ ] 404 retorna JSON amigavel.
- [ ] Erros 500 nao vazam stack trace em producao.

# Checklist de Producao Final - R2R CRM SaaS

## Supabase

- [ ] Projeto Supabase criado.
- [ ] `supabase/migrations/001_schema.sql` executado sem erro.
- [ ] `supabase/seed.sql` executado ou ajustado para o e-mail admin real.
- [ ] Usuario admin criado no Supabase Auth.
- [ ] Registro correspondente existe em `public.usuarios`.
- [ ] RLS habilitado nas tabelas operacionais.
- [ ] View `public.dashboard_resumo` criada com `security_invoker`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` fica somente no backend.
- [ ] Chave publica fica somente em `config.js` quando necessaria.

## Backend

- [ ] Node.js 18+ disponivel.
- [ ] `npm install` executado.
- [ ] `.env` criado a partir de `.env.example`.
- [ ] `NODE_ENV=production`.
- [ ] `PORT=3000` ou porta definida pelo provedor.
- [ ] `SUPABASE_URL` configurado.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurado no backend.
- [ ] `CORS_ORIGIN` aponta para o dominio real do frontend.
- [ ] `/health` retorna `status: online`.
- [ ] `/api/auth/login` autentica usuario real.
- [ ] `/api/me` retorna perfil e `empresa_id`.
- [ ] `/api/leads` retorna somente dados da empresa do usuario.
- [ ] `/api/contacts` responde.
- [ ] `/api/messages` responde.
- [ ] `/api/reports/dashboard` responde.
- [ ] Logs nao exibem segredos.
- [ ] `ALLOW_DEMO_AUTH=false` em producao.

## Frontend

- [ ] Arquivos de `frontend-public_html` enviados para `public_html`.
- [ ] `config.js` aponta para a URL publica do backend.
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
- [ ] `EVOLUTION_API_KEY` configurado no backend.
- [ ] `EVOLUTION_INSTANCE` definido.
- [ ] `/api/integrations/evolution/status` responde.
- [ ] `/api/integrations/evolution/connect` gera QR Code ou erro amigavel.
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
- [ ] Logout testado.
- [ ] 404 retorna JSON amigavel.
- [ ] Erros 500 nao vazam stack trace em producao.

# Checklist Final de Testes

## Testes executados neste ambiente

- [x] `node --check 02_BACKEND_EASYPANEL_NODE/server.js`
- [x] `node tests/run-tests.js`
- [x] Health endpoint em modo de teste
- [x] Login em modo de teste
- [x] `/api/auth/me`
- [x] CRUD básico de leads
- [x] Conversão de lead para cliente
- [x] Dashboard summary
- [x] Webhook n8n em modo de teste

## Testes que dependem das suas credenciais reais

- [ ] Login real via Supabase Auth
- [ ] Validação real de RLS no Supabase
- [ ] CRUD real de leads/clientes/tarefas no Supabase
- [ ] Evolution API real
- [ ] OpenAI real
- [ ] Meta/Google OAuth real
- [ ] Deploy EasyPanel
- [ ] CORS com domínio final
- [ ] Frontend apontando para API final

## Critério para produção

Acesse `/health` no backend publicado e confirme:

- `success: true`
- `supabaseConfigured: true`
- `missingEnv: []`
- CORS liberado para o domínio do CRM

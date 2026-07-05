const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.ALLOW_DEMO_AUTH = 'true';
process.env.DEMO_USER_EMAIL = 'admin@demo.local';
process.env.RATE_LIMIT_MAX = '0';
process.env.DATA_DIR = path.join(__dirname, '.tmp-data');
process.env.UPLOAD_DIR = path.join(__dirname, '.tmp-uploads');
process.env.EVOLUTION_WEBHOOK_SECRET = 'test-secret';
process.env.EVOLUTION_WEBHOOK_EMPRESA_ID = '00000000-0000-4000-8000-000000000001';

fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });

const { normalizePlanId } = require('../src/billing');
const { resourceForPath } = require('../src/resources');
const { sanitizePayload, stripSensitiveFields } = require('../src/security');
const { permissionsFromProfile } = require('../src/auth');
const { applyFilters, seedLocalData, LocalStore } = require('../src/store');
const { createServer } = require('../server');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function request(base, method, pathname, body, token, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { res, data };
}

test('normaliza planos comerciais', () => {
  assert.strictEqual(normalizePlanId('Starter'), 'starter');
  assert.strictEqual(normalizePlanId('negocios'), 'business');
  assert.strictEqual(normalizePlanId('enterprise'), 'premium');
  assert.strictEqual(normalizePlanId('desconhecido'), null);
});

test('resolve recursos REST oficiais e aliases', () => {
  assert.strictEqual(resourceForPath('/api/leads').table, 'leads');
  assert.strictEqual(resourceForPath('/api/contacts').table, 'clientes');
  assert.strictEqual(resourceForPath('/api/contatos').table, 'clientes');
  assert.strictEqual(resourceForPath('/api/atendimentos').table, 'conversas');
  assert.strictEqual(resourceForPath('/api/logs').table, 'audit_logs');
  assert.strictEqual(resourceForPath('/api/messages').table, 'mensagens');
  assert.strictEqual(resourceForPath('/api/integrations').table, 'integracoes');
  assert.strictEqual(resourceForPath('/api/funil-etapas').table, 'funil_etapas');
  assert.strictEqual(resourceForPath('/api/leads/abc').id, 'abc');
  assert.strictEqual(resourceForPath('/api/nao-existe'), null);
});

test('remove campos sensiveis de payloads', () => {
  const payload = sanitizePayload({
    id: 'nao',
    nome: ' Lead ',
    token: 'abc',
    config: { api_key: 'segredo', visivel: true }
  });
  assert.strictEqual(payload.id, undefined);
  assert.strictEqual(payload.nome, 'Lead');
  assert.strictEqual(payload.token, '[redacted]');
  assert.strictEqual(payload.config.api_key, '[redacted]');
  assert.strictEqual(payload.config.visivel, true);
});

test('mascara segredos em listas e permite endpoint especial salvar segredo', () => {
  const masked = stripSensitiveFields([{ config: { apiKey: 'abc', url: 'https://evo.local' } }]);
  assert.strictEqual(masked[0].config.apiKey, '[redacted]');
  assert.strictEqual(masked[0].config.url, 'https://evo.local');

  const payload = sanitizePayload(
    { config: { apiKey: 'abc', url: 'https://evo.local' } },
    { allowSensitive: true }
  );
  assert.strictEqual(payload.config.apiKey, 'abc');
});

test('filtra dados locais por busca e ordenacao', () => {
  const seed = seedLocalData();
  const rows = applyFilters(seed.leads, { search: 'demo', order: 'score.desc' }, { search: ['nome', 'email'], defaultOrder: 'created_at.desc' });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].nome, 'Lead Demo');
});

test('migration contem tabelas minimas, RLS e indices', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '001_schema.sql'), 'utf8');
  [
    'empresas', 'usuarios', 'planos', 'assinaturas', 'leads', 'clientes',
    'oportunidades', 'funis', 'funil_etapas', 'atividades', 'tarefas',
    'conversas', 'mensagens', 'campanhas', 'fontes_lead', 'integracoes',
    'automacoes', 'automacao_regras', 'arquivos', 'tags', 'lead_tags',
    'notificacoes', 'webhooks_logs', 'billing_webhooks', 'audit_logs',
    'api_keys', 'permissoes', 'feature_flags'
  ].forEach(table => {
    assert.ok(sql.includes('public.' + table), 'missing table ' + table);
  });
  assert.ok(sql.includes('enable row level security'));
  assert.ok(sql.includes('app_private.has_empresa_access'));
  assert.ok(sql.includes('app_private.can_write_empresa'));
  assert.ok(sql.includes('app_private.is_empresa_admin'));
  assert.ok(sql.includes('public.dashboard_resumo'));
  assert.ok(sql.includes('public.contatos'));
  assert.ok(sql.includes('public.atendimentos'));
  assert.ok(sql.includes('security_invoker'));
  assert.ok(sql.includes('idx_leads_empresa_created'));
  assert.ok(sql.includes('idx_integracoes_empresa_tipo'));
  assert.ok(sql.includes('idx_mensagens_empresa_external_unique'));
  assert.ok(sql.includes('idx_usuarios_auth_user_id_unique'));
  assert.ok(sql.includes('app_private.enforce_same_empresa'));
});

test('RBAC nao trata gestor como administrador da empresa', () => {
  const gestor = permissionsFromProfile({ tipo_usuario: 'gestor' });
  assert.strictEqual(gestor.manager, true);
  assert.strictEqual(gestor.admin, false);
  assert.strictEqual(gestor.company_admin, false);

  const admin = permissionsFromProfile({ tipo_usuario: 'administrador' });
  assert.strictEqual(admin.admin, true);
  assert.strictEqual(admin.company_admin, true);
});

test('store local bloqueia relacoes entre empresas diferentes', async () => {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  const local = new LocalStore();
  const data = local.read();
  const empresaA = data.empresas[0].id;
  const empresaB = '00000000-0000-4000-8000-000000000002';
  data.empresas.push({ id: empresaB, nome: 'Empresa B', status: 'ativo' });
  data.leads.push({ id: '00000000-0000-4000-8000-000000000200', empresa_id: empresaB, nome: 'Lead B' });
  local.write(data);

  const ctxA = {
    empresaId: empresaA,
    permissions: { tipo: 'usuario', can_write: true, admin: false, super_admin: false }
  };
  await assert.rejects(
    () => local.insert('arquivos', { nome: 'x.txt', path: 'x.txt', lead_id: '00000000-0000-4000-8000-000000000200' }, ctxA, { companyScoped: true }),
    /Relacao invalida/
  );
});

test('servidor responde health, login, rotas protegidas e Evolution sem config', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  try {
    let out = await request(base, 'GET', '/health');
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.status, 'online');

    out = await request(base, 'GET', '/api/health');
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.success, true);

    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    out = await request(base, 'POST', '/api/billing/webhook', { event: 'fake' });
    process.env.NODE_ENV = oldNodeEnv;
    assert.strictEqual(out.res.status, 401);

    out = await request(base, 'POST', '/api/auth/login', { email: 'admin@demo.local', password: 'demo' });
    assert.strictEqual(out.res.status, 200);
    assert.ok(out.data.access_token);
    const token = out.data.access_token;

    out = await request(base, 'GET', '/api/me', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.profile.email, 'admin@demo.local');

    out = await request(base, 'GET', '/api/leads', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.ok(Array.isArray(out.data.data));

    out = await request(base, 'GET', '/api/contacts', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.ok(Array.isArray(out.data.data));

    out = await request(base, 'GET', '/api/contatos', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.ok(Array.isArray(out.data.data));

    out = await request(base, 'GET', '/api/atendimentos', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.ok(Array.isArray(out.data.data));

    out = await request(base, 'GET', '/api/reports/dashboard', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.success, true);

    out = await request(base, 'GET', '/api/integrations/evolution/status', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.configured, false);
    assert.strictEqual(out.data.status, 'not_configured');

    const fakeEvolution = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ base64: 'iVBORw0KGgo=' }));
    });
    await new Promise(resolve => fakeEvolution.listen(0, '127.0.0.1', resolve));
    const fakeEvolutionBase = 'http://127.0.0.1:' + fakeEvolution.address().port;
    try {
      out = await request(base, 'POST', '/api/whatsapp/connect', {
        url: fakeEvolutionBase,
        apiKey: 'evo-test-key',
        instance: 'Ruan Marcos'
      }, token);
      assert.strictEqual(out.res.status, 200);
      assert.strictEqual(out.data.configured, true);
      assert.strictEqual(out.data.status, 'qrcode');
      assert.ok(out.data.qrcode.startsWith('data:image/png;base64,'));
    } finally {
      await new Promise(resolve => fakeEvolution.close(resolve));
    }

    out = await request(base, 'POST', '/api/messages/send', { number: '5547999990000', text: 'Ola' }, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.configured, false);

    out = await request(base, 'POST', '/api/integrations/ai', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test'
    }, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.configured, true);
    assert.strictEqual(out.data.config.has_api_key, true);

    out = await request(base, 'GET', '/api/integrations/ai', undefined, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.configured, true);
    assert.strictEqual(out.data.config.has_api_key, true);

    let n8nHit = false;
    const fakeN8n = http.createServer((req, res) => {
      n8nHit = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise(resolve => fakeN8n.listen(0, '127.0.0.1', resolve));
    const fakeN8nUrl = 'http://127.0.0.1:' + fakeN8n.address().port + '/webhook/teste';
    try {
      out = await request(base, 'POST', '/api/integrations/n8n', { webhookUrl: fakeN8nUrl, apiKey: 'n8n-test' }, token);
      assert.strictEqual(out.res.status, 200);
      assert.strictEqual(out.data.configured, true);
      out = await request(base, 'POST', '/api/n8n/test', {}, token);
      assert.strictEqual(out.res.status, 200);
      assert.strictEqual(out.data.configured, true);
      assert.strictEqual(out.data.status, 200);
      assert.strictEqual(n8nHit, true);
    } finally {
      await new Promise(resolve => fakeN8n.close(resolve));
    }

    out = await request(base, 'POST', '/api/integrations/meta', {
      token: 'meta-test-token',
      phoneNumberId: '123',
      wabaId: '456'
    }, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.configured, true);
    assert.strictEqual(out.data.config.has_token, true);

    const localFile = path.join(process.env.DATA_DIR, 'r2r-crm-local.json');
    const localData = JSON.parse(fs.readFileSync(localFile, 'utf8'));
    localData.usuarios[0].tipo_usuario = 'administrador';
    fs.writeFileSync(localFile, JSON.stringify(localData, null, 2));

    out = await request(base, 'POST', '/api/features', { feature_name: 'meta_ads', enabled: false }, token);
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.features.meta_ads, false);

    out = await request(base, 'GET', '/api/meta/campaigns', undefined, token);
    assert.strictEqual(out.res.status, 403);

    out = await request(base, 'POST', '/api/files/upload', {
      nome: 'contrato.txt',
      mime_type: 'text/plain',
      content_base64: Buffer.from('arquivo de teste').toString('base64'),
      lead_id: '00000000-0000-4000-8000-000000000100'
    }, token);
    assert.strictEqual(out.res.status, 201);
    assert.ok(out.data.data.id);
    assert.strictEqual(out.data.data.mime_type, 'text/plain');

    const webhookPayload = {
      event: 'messages.upsert',
      instance: 'r2r-crm',
      data: {
        key: { remoteJid: '5547999990000@s.whatsapp.net', fromMe: false, id: 'wa-msg-1' },
        pushName: 'Lead WhatsApp',
        message: { conversation: 'Ola, quero atendimento' }
      }
    };
    out = await request(base, 'POST', '/api/webhooks/evolution', webhookPayload, undefined, { 'x-evolution-secret': 'test-secret' });
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.data.message_saved, true);

    out = await request(base, 'POST', '/api/webhooks/evolution', webhookPayload, undefined, { 'x-evolution-secret': 'test-secret' });
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.data.duplicate, true);

    out = await request(base, 'POST', '/api/api-keys', { nome: 'Webhook Evolution Teste' }, token);
    assert.strictEqual(out.res.status, 201);
    assert.ok(out.data.api_key);

    const oldWebhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = '';
    out = await request(base, 'POST', '/api/webhooks/evolution', {
      event: 'messages.upsert',
      instance: 'r2r-crm',
      data: {
        key: { remoteJid: '5547888880000@s.whatsapp.net', fromMe: false, id: 'wa-msg-2' },
        pushName: 'Lead API Key',
        message: { conversation: 'Webhook com API key' }
      }
    }, undefined, { 'x-api-key': out.data.api_key });
    process.env.EVOLUTION_WEBHOOK_SECRET = oldWebhookSecret;
    assert.strictEqual(out.res.status, 200);
    assert.strictEqual(out.data.data.message_saved, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

(async () => {
  for (const item of tests) {
    try {
      await item.fn();
      console.log('OK ' + item.name);
    } catch (error) {
      console.error('FAIL ' + item.name);
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  if (process.exitCode) process.exit(process.exitCode);
})();

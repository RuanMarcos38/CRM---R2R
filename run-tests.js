#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '02_BACKEND_EASYPANEL_NODE');
const port = 3199;
const serverPath = path.join(root, 'server.js');

function delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
async function request(pathname, options = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token', ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { status: res.status, data };
}

(async () => {
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', R2R_TEST_MODE: '1', CORS_ORIGIN: '*' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', d => logs += d.toString());
  child.stderr.on('data', d => logs += d.toString());

  try {
    await delay(800);
    let r = await request('/health');
    assert.equal(r.status, 200, 'health deve responder 200');
    assert.equal(r.data.success, true, 'health deve responder success=true');

    r = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@r2rmarketingdigital.com.br', password: 'teste' } });
    assert.equal(r.status, 200, 'login teste deve responder 200');
    assert.ok(r.data.data.access_token, 'login deve retornar access_token');

    r = await request('/api/auth/me');
    assert.equal(r.status, 200, 'me deve responder 200');
    assert.equal(r.data.data.company.name, 'R2R Test Company');

    r = await request('/api/leads', { method: 'POST', body: { name: 'Lead Teste', phone: '5547999999999', source: 'teste' } });
    assert.equal(r.status, 201, 'criar lead deve responder 201');
    const leadId = r.data.data.id;
    assert.ok(leadId, 'lead criado deve ter id');

    r = await request('/api/leads');
    assert.equal(r.status, 200, 'listar leads deve responder 200');
    assert.equal(r.data.data.length, 1, 'deve ter um lead');

    r = await request(`/api/leads/${leadId}`, { method: 'PATCH', body: { status: 'qualified' } });
    assert.equal(r.status, 200, 'atualizar lead deve responder 200');
    assert.equal(r.data.data.status, 'qualified');

    r = await request(`/api/leads/${leadId}/convert`, { method: 'POST', body: {} });
    assert.equal(r.status, 200, 'converter lead deve responder 200');
    assert.ok(r.data.data.client.id, 'cliente convertido deve ter id');

    r = await request('/api/dashboard/summary');
    assert.equal(r.status, 200, 'dashboard deve responder 200');
    assert.ok(Number.isFinite(r.data.data.total_leads), 'dashboard deve ter total_leads');

    r = await request('/api/webhooks/n8n/leads?token=test', { method: 'POST', body: { name: 'Webhook Lead', phone: '5547000000000' }, headers: { 'x-webhook-token': 'test' } });
    assert.equal(r.status, 200, 'webhook em test env deve responder 200');

    console.log('✅ Todos os testes locais passaram.');
  } catch (err) {
    console.error('❌ Teste falhou:', err.message);
    console.error(logs);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();

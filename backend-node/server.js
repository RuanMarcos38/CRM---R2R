#!/usr/bin/env node
/*
  R2R CRM SaaS API
  - Node.js sem dependencias externas
  - Frontend estatico preservado
  - Supabase/PostgreSQL como persistencia principal
  - Fallback local apenas para desenvolvimento sem credenciais
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { loadEnv, boolEnv, listEnv } = require('./src/env');
const { readBody, sendJson, sendText, serveFile, cleanUrl } = require('./src/http');
const { corsHeaders, checkRateLimit, securityHeaders, stripSensitiveFields, sha256 } = require('./src/security');
const { createStore } = require('./src/store');
const { resolveAuthContext, requireAuth, verifyApiKey, createLocalSessionToken, localSessionTtlSeconds, localAdminProfile } = require('./src/auth');
const { RESOURCES, resourceForPath } = require('./src/resources');
const { buildReportsSummary } = require('./src/reports');
const { normalizePlanId, publicBillingPlans, checkoutUrlForPlan, whatsappCheckoutFallback, saveBillingWebhookLog } = require('./src/billing');
const { integrationStatus, openAIChat, normalizeEvolutionConfig, evolutionRequest, metaRequest } = require('./src/integrations');

loadEnv();

const VERSION = '2026.07.03-easypanel-node';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = resolvePublicDir();
const store = createStore();

function demoAuthEnabled() {
  return boolEnv('ALLOW_DEMO_AUTH', store.kind === 'local' && process.env.NODE_ENV !== 'production');
}

function configuredAdminEmail() {
  return String(process.env.R2R_ADMIN_EMAIL || '').trim().toLowerCase();
}

function adminPasswordMatches(password) {
  const plain = String(process.env.R2R_ADMIN_PASSWORD || '');
  const digest = String(process.env.R2R_ADMIN_PASSWORD_SHA256 || '').trim().toLowerCase();
  if (!plain && !digest) return false;
  if (plain && password === plain) return true;
  return !!(digest && sha256(password) === digest);
}

function healthPayload(req) {
  return {
    ok: true,
    success: true,
    status: 'online',
    service: 'r2r-crm-saas-api',
    version: VERSION,
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
    storage: store.kind,
    public_dir: PUBLIC_DIR,
    entrypoint: 'repo-root-node',
    node: process.version,
    host: HOST,
    port: PORT,
    api_base: publicConfig(req).api_base,
    integrations: integrationStatus(),
    supabase: {
      configured: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)),
      public_configured: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY))
    }
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return { raw: text };
  }
}

function resolvePublicDir() {
  const defaultPublicDir = path.join(__dirname, '..', 'frontend-public_html');
  const candidates = [
    process.env.PUBLIC_DIR,
    path.join(__dirname, 'frontend'),
    path.join(__dirname, '..', 'frontend'),
    defaultPublicDir
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
    } catch (_) {}
  }
  return path.resolve(defaultPublicDir);
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || body.usuario || body.username || '').trim().toLowerCase();
  const password = String(body.password || body.senha || '');

  if (!email || !password) {
    return sendJson(req, res, 400, { ok: false, success: false, error: 'Informe email e senha.' });
  }

  const adminEmail = configuredAdminEmail();
  if (adminEmail && email === adminEmail && adminPasswordMatches(password)) {
    const authUser = { id: 'env-admin', email, local_admin: true };
    const profile = await store.findProfileByAuthUser(authUser).catch(() => null) || localAdminProfile(authUser);
    const token = createLocalSessionToken(authUser);
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      access_token: token,
      expires_in: localSessionTtlSeconds(),
      token_type: 'bearer',
      user: authUser,
      profile,
      empresa_id: profile && profile.empresa_id || null,
      message: 'Login administrativo realizado pelas variaveis do EasyPanel.'
    });
  }

  const supabaseUrl = cleanUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '');
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (supabaseUrl && publicKey) {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publicKey },
      body: JSON.stringify({ email, password })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      return sendJson(req, res, response.status === 400 ? 401 : response.status, {
        ok: false,
        success: false,
        error: data.error_description || data.msg || data.message || 'Login invalido.'
      });
    }

    const authUser = data.user || {};
    const profile = await store.findProfileByAuthUser(authUser).catch(() => null);
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'bearer',
      user: { id: authUser.id, email: authUser.email || email },
      profile,
      empresa_id: profile && profile.empresa_id || null,
      message: profile ? 'Login realizado.' : 'Login autenticado no Supabase, mas o perfil ainda nao existe em public.usuarios.'
    });
  }

  if (demoAuthEnabled() && email === String(process.env.DEMO_USER_EMAIL || 'admin@demo.local').toLowerCase()) {
    const authUser = { id: 'demo-auth-user', email };
    const profile = await store.findProfileByAuthUser(authUser);
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      access_token: 'demo-local-token',
      token_type: 'bearer',
      user: authUser,
      profile,
      empresa_id: profile && profile.empresa_id || null,
      demo_mode: true,
      message: 'Login demo local ativo somente fora de producao.'
    });
  }

  return sendJson(req, res, 503, {
    ok: false,
    success: false,
    configured: false,
    error: 'Autenticacao nao configurada. Configure SUPABASE_URL e SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY.'
  });
}

function publicConfig(req) {
  const apiBase = cleanUrl(process.env.PUBLIC_URL || process.env.APP_URL || `${req.protocol || 'http'}://${req.headers.host || `localhost:${PORT}`}`);
  return {
    ok: true,
    version: VERSION,
    api_base: apiBase,
    supabase: {
      url: cleanUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || ''),
      publishable_key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
      configured: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY))
    },
    integrations: integrationStatus(),
    plans: publicBillingPlans(),
    storage: store.kind,
    demo_mode: store.kind === 'local',
    cors_origins: [...new Set([...listEnv('CORS_ORIGIN', []), ...listEnv('FRONTEND_URL', [])])].filter(Boolean)
  };
}

function injectRuntimeConfig(html, req) {
  const cfg = publicConfig(req);
  const script = [
    '<script id="r2r-runtime-config">',
    'window.R2R_API_BASE=window.R2R_API_BASE||' + JSON.stringify(cfg.api_base) + ';',
    'window.R2R_SUPABASE_URL=window.R2R_SUPABASE_URL||' + JSON.stringify(cfg.supabase.url) + ';',
    'window.R2R_SUPABASE_PUBLISHABLE_KEY=window.R2R_SUPABASE_PUBLISHABLE_KEY||' + JSON.stringify(cfg.supabase.publishable_key) + ';',
    'window.R2R_SUPABASE_ANON_KEY=window.R2R_SUPABASE_ANON_KEY||window.R2R_SUPABASE_PUBLISHABLE_KEY;',
    'window.R2R_CONFIG=Object.assign({API_BASE_URL:' + JSON.stringify(cfg.api_base) + ',APP_NAME:"R2R CRM",ENV:' + JSON.stringify(process.env.NODE_ENV || 'development') + '},window.R2R_CONFIG||{});',
    'window.R2R_PUBLIC_CONFIG=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';',
    '</script>'
  ].join('');

  if (html.includes('<head>')) return html.replace('<head>', '<head>' + script);
  return script + html;
}

function routeKey(method, pathname) {
  return `${method.toUpperCase()} ${pathname}`;
}

function safeData(data) {
  return stripSensitiveFields(data);
}

function integrationResource(options = {}) {
  return { ...RESOURCES.integracoes, ...options };
}

async function getWhatsappIntegration(ctx) {
  const rows = await store.list('integracoes', { 'eq.tipo': 'whatsapp', limit: 1 }, ctx, integrationResource()).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getWhatsappConfig(ctx) {
  const row = await getWhatsappIntegration(ctx);
  const saved = row && row.config && typeof row.config === 'object' ? row.config : {};
  const cfg = normalizeEvolutionConfig({
    url: saved.url || process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || '',
    key: saved.key || saved.apiKey || saved.api_key || saved.apikey || process.env.EVOLUTION_API_KEY || '',
    instance: saved.instance || saved.inst || process.env.EVOLUTION_INSTANCE || 'r2r-crm'
  });
  return { ...cfg, source: row ? 'database' : 'env', row };
}

async function saveWhatsappConfig(ctx, body) {
  const current = await getWhatsappIntegration(ctx);
  const currentConfig = current && current.config && typeof current.config === 'object' ? current.config : {};
  const url = cleanUrl(body.url || body.evolution_url || currentConfig.url || '');
  const key = String(body.apiKey || body.api_key || body.apikey || body.key || currentConfig.apiKey || currentConfig.api_key || currentConfig.key || '').trim();
  const instance = String(body.instance || body.inst || currentConfig.instance || currentConfig.inst || 'r2r-crm').trim() || 'r2r-crm';

  if (!url) {
    const error = new Error('Informe a URL da Evolution API.');
    error.statusCode = 400;
    throw error;
  }
  if (!key) {
    const error = new Error('Informe a API Key Global da Evolution API.');
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    tipo: 'whatsapp',
    nome: 'Evolution API',
    ativa: true,
    config: {
      provider: 'evolution',
      url,
      apiKey: key,
      instance,
      inst: instance,
      updated_at: new Date().toISOString()
    }
  };
  const resource = integrationResource({ allowSensitive: true });
  const row = current
    ? await store.update('integracoes', current.id, payload, ctx, resource)
    : await store.insert('integracoes', payload, ctx, resource);
  return row;
}

async function handlePublic(req, res, url) {
  const key = routeKey(req.method, url.pathname);

  if (key === 'GET /health' || key === 'GET /healthz' || key === 'GET /api/health') {
    return sendJson(req, res, 200, healthPayload(req));
  }

  if (key === 'GET /api/config') {
    return sendJson(req, res, 200, publicConfig(req));
  }

  if (key === 'POST /api/auth/login') {
    return handleLogin(req, res);
  }

  if (key === 'POST /api/auth/logout') {
    return sendJson(req, res, 200, { ok: true, success: true, message: 'Sessao encerrada no cliente.' });
  }

  if (key === 'GET /api/billing/plans') {
    return sendJson(req, res, 200, {
      ok: true,
      provider: process.env.PAYMENT_PROVIDER || 'checkout_link',
      plans: publicBillingPlans()
    });
  }

  if (key === 'POST /api/billing/webhook') {
    const body = await readBody(req);
    await store.insert('billing_webhooks', {
      provider: process.env.PAYMENT_PROVIDER || 'checkout_link',
      event_type: body.event || body.type || body.status || 'unknown',
      payload: body,
      status: 'received'
    }, { system: true }).catch(() => null);
    saveBillingWebhookLog(body);
    return sendJson(req, res, 200, { ok: true, received: true });
  }

  return null;
}

async function handleAuth(req, res, url, ctx) {
  if ((url.pathname === '/api/auth/profile' || url.pathname === '/api/me') && req.method === 'GET') {
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      user: ctx.user,
      profile: ctx.profile,
      empresa_id: ctx.empresaId,
      permissions: ctx.permissions
    });
  }
  return null;
}

async function handleCrud(req, res, url, ctx) {
  const resource = resourceForPath(url.pathname);
  if (!resource) return null;

  if (resource.adminOnly && !ctx.permissions.admin) {
    return sendJson(req, res, 403, { ok: false, error: 'Permissao insuficiente.' });
  }

  if (resource.table === 'empresas' && !ctx.permissions.super_admin && resource.id && resource.id !== ctx.empresaId) {
    return sendJson(req, res, 403, { ok: false, error: 'Empresa fora do escopo do usuario.' });
  }

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
  const query = Object.fromEntries(url.searchParams.entries());
  if (resource.table === 'empresas' && !ctx.permissions.super_admin) query['eq.id'] = ctx.empresaId;
  const id = resource.id || null;

  if (req.method === 'GET' && !id) {
    const rows = await store.list(resource.table, query, ctx, resource);
    return sendJson(req, res, 200, { ok: true, data: safeData(rows) });
  }

  if (req.method === 'GET' && id) {
    const row = await store.get(resource.table, id, ctx, resource);
    return row ? sendJson(req, res, 200, { ok: true, data: safeData(row) }) : sendJson(req, res, 404, { ok: false, error: 'Registro nao encontrado.' });
  }

  if (req.method === 'POST') {
    const row = await store.insert(resource.table, body, ctx, resource);
    await audit(ctx, 'create', resource.table, row && row.id, body);
    return sendJson(req, res, 201, { ok: true, data: safeData(row) });
  }

  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    const row = await store.update(resource.table, id, body, ctx, resource);
    await audit(ctx, 'update', resource.table, id, body);
    return sendJson(req, res, 200, { ok: true, data: safeData(row) });
  }

  if (req.method === 'DELETE' && id) {
    const row = await store.remove(resource.table, id, ctx, resource);
    await audit(ctx, 'delete', resource.table, id, {});
    return sendJson(req, res, 200, { ok: true, data: safeData(row) });
  }

  return sendJson(req, res, 405, { ok: false, error: 'Metodo nao permitido.' });
}

async function handleReports(req, res, url, ctx) {
  if ((url.pathname === '/api/reports/summary' || url.pathname === '/api/reports/dashboard' || url.pathname === '/api/dashboard') && req.method === 'GET') {
    const summary = await buildReportsSummary(store, ctx, Object.fromEntries(url.searchParams.entries()));
    return sendJson(req, res, 200, { ok: true, success: true, data: summary });
  }
  return null;
}

async function handleSettings(req, res, url, ctx) {
  if (url.pathname !== '/api/settings') return null;
  if (!ctx.permissions.admin) return sendJson(req, res, 403, { ok: false, success: false, error: 'Somente admin pode alterar configuracoes.' });

  const resource = RESOURCES.configuracoes;
  if (req.method === 'GET') {
    const rows = await store.list('configuracoes', { limit: 200 }, ctx, resource);
    const settings = {};
    for (const row of rows) settings[row.chave] = row.valor;
    return sendJson(req, res, 200, { ok: true, success: true, data: settings, rows });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = await readBody(req);
    const saved = [];
    for (const [chave, valor] of Object.entries(body || {})) {
      if (!chave || ['id', 'empresa_id', 'created_at', 'updated_at'].includes(chave)) continue;
      const current = await store.list('configuracoes', { 'eq.chave': chave, limit: 1 }, ctx, resource);
      const payload = { chave, valor };
      saved.push(current && current[0]
        ? await store.update('configuracoes', current[0].id, payload, ctx, resource)
        : await store.insert('configuracoes', payload, ctx, resource));
    }
    return sendJson(req, res, 200, { ok: true, success: true, data: saved });
  }

  return sendJson(req, res, 405, { ok: false, success: false, error: 'Metodo nao permitido.' });
}

async function handleIntegrations(req, res, url, ctx) {
  if (url.pathname === '/api/integrations/status' && req.method === 'GET') {
    return sendJson(req, res, 200, { ok: true, success: true, integrations: integrationStatus() });
  }

  if (url.pathname === '/api/ai/test' && req.method === 'POST') {
    const out = await openAIChat('Responda apenas: IA conectada com sucesso.', [], ctx);
    return sendJson(req, res, 200, { ok: true, ...out });
  }

  if (url.pathname === '/api/ai/chat' && req.method === 'POST') {
    const body = await readBody(req);
    const out = await openAIChat(body.message || body.text || 'Ola', body.history || [], ctx);
    if (body.lead_id) {
      await store.insert('atividades', {
        lead_id: body.lead_id,
        tipo: 'ia_chat',
        descricao: out.reply,
        metadata: { model: out.model, configured: out.configured }
      }, ctx, RESOURCES.atividades).catch(() => null);
    }
    return sendJson(req, res, 200, { ok: true, ...out });
  }

  if ((url.pathname === '/api/integrations/whatsapp' || url.pathname === '/api/integrations/evolution') && req.method === 'GET') {
    const cfg = await getWhatsappConfig(ctx);
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      configured: !!(cfg.url && cfg.key),
      source: cfg.source,
      config: {
        provider: 'evolution',
        url: cfg.url,
        instance: cfg.instance,
        inst: cfg.instance,
        has_api_key: !!cfg.key
      }
    });
  }

  if ((url.pathname === '/api/integrations/whatsapp' || url.pathname === '/api/integrations/evolution') && req.method === 'POST') {
    if (!ctx.permissions.admin) return sendJson(req, res, 403, { ok: false, error: 'Somente admin pode configurar o WhatsApp.' });
    const row = await saveWhatsappConfig(ctx, await readBody(req));
    const cfg = row.config || {};
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      configured: true,
      message: 'Configuracao da Evolution API salva no backend.',
      config: {
        provider: 'evolution',
        url: cfg.url || '',
        instance: cfg.instance || cfg.inst || 'r2r-crm',
        inst: cfg.instance || cfg.inst || 'r2r-crm',
        has_api_key: !!(cfg.apiKey || cfg.api_key || cfg.key)
      }
    });
  }

  if (url.pathname === '/api/whatsapp/status' && req.method === 'GET') {
    const cfg = await getWhatsappConfig(ctx);
    const result = await evolutionRequest('/instance/fetchInstances', 'GET', null, cfg);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/integrations/evolution/status' && req.method === 'GET') {
    const cfg = await getWhatsappConfig(ctx);
    const result = await evolutionRequest('/instance/fetchInstances', 'GET', null, cfg);
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/connect' || url.pathname === '/api/integrations/evolution/connect') && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = await getWhatsappConfig(ctx);
    const result = await evolutionRequest('/instance/connect', 'POST', body, cfg);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/integrations/evolution/qrcode' && req.method === 'GET') {
    const cfg = await getWhatsappConfig(ctx);
    const result = await evolutionRequest('/instance/connect', 'POST', {}, cfg);
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/disconnect' || url.pathname === '/api/integrations/evolution/disconnect') && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = await getWhatsappConfig(ctx);
    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');
    const result = await evolutionRequest(`/instance/logout/${instance}`, 'DELETE', null, cfg);
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/send' || url.pathname === '/api/messages/send') && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = await getWhatsappConfig(ctx);
    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');
    const result = await evolutionRequest(`/message/sendText/${instance}`, 'POST', {
      number: body.number,
      textMessage: { text: body.text || body.message || '' }
    }, cfg);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/meta/status' && req.method === 'GET') {
    const result = await metaRequest('/me?fields=id,name');
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/meta/campaigns' && req.method === 'GET') {
    const accountId = process.env.META_AD_ACCOUNT_ID || url.searchParams.get('account_id') || '';
    if (!accountId) return sendJson(req, res, 200, { ok: true, configured: false, data: [], message: 'Configure META_AD_ACCOUNT_ID no backend.' });
    const fields = 'name,status,objective,daily_budget,lifetime_budget,insights{spend,reach,impressions,clicks,actions}';
    const result = await metaRequest(`/${encodeURIComponent(accountId)}/campaigns?fields=${encodeURIComponent(fields)}&limit=50`);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/n8n/test' && req.method === 'POST') {
    const webhook = process.env.N8N_WEBHOOK_URL;
    if (!webhook) return sendJson(req, res, 200, { ok: true, configured: false, message: 'N8N_WEBHOOK_URL nao configurado.' });
    const payload = { test: true, source: 'r2r-crm', empresa_id: ctx.empresaId, at: new Date().toISOString() };
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return sendJson(req, res, 200, { ok: true, configured: true, status: response.status });
  }

  return null;
}

async function handleBilling(req, res, url, ctx) {
  if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
    const body = await readBody(req);
    const planId = normalizePlanId(body.plan_id || body.plan || body.plano || body.name);
    if (!planId) return sendJson(req, res, 400, { ok: false, error: 'Plano invalido. Use starter, business ou premium.' });
    const plan = publicBillingPlans().find(p => p.id === planId);
    const configuredUrl = checkoutUrlForPlan(planId);
    const allowFallback = boolEnv('PAYMENT_ALLOW_WHATSAPP_FALLBACK', true);
    const checkoutUrl = configuredUrl || (allowFallback ? whatsappCheckoutFallback(plan, body.customer || body) : '');
    if (!checkoutUrl) {
      return sendJson(req, res, 200, { ok: false, configured: false, plan, message: `Configure CHECKOUT_${planId.toUpperCase()}_URL no backend.` });
    }
    await store.insert('assinaturas', {
      plan_id: planId,
      provider: process.env.PAYMENT_PROVIDER || 'checkout_link',
      status: configuredUrl ? 'checkout_created' : 'manual_checkout',
      checkout_url: checkoutUrl
    }, ctx, RESOURCES.assinaturas).catch(() => null);
    return sendJson(req, res, 200, {
      ok: true,
      configured: !!configuredUrl,
      provider: process.env.PAYMENT_PROVIDER || 'checkout_link',
      plan,
      checkout_url: checkoutUrl
    });
  }
  return null;
}

async function handleApiKeys(req, res, url, ctx) {
  if (url.pathname === '/api/api-keys' && req.method === 'POST') {
    if (!ctx.permissions.admin) return sendJson(req, res, 403, { ok: false, error: 'Somente admin pode gerar API keys.' });
    const body = await readBody(req);
    const created = await store.createApiKey(body.nome || body.name || 'Chave API', ctx);
    return sendJson(req, res, 201, { ok: true, data: created.publicRow, api_key: created.plainText });
  }

  if (url.pathname === '/api/api-keys' && req.method === 'GET') {
    if (!ctx.permissions.admin) return sendJson(req, res, 403, { ok: false, error: 'Somente admin pode listar API keys.' });
    const rows = await store.list('api_keys', {}, ctx, RESOURCES.api_keys);
    return sendJson(req, res, 200, { ok: true, data: rows.map(r => ({ ...r, key_hash: undefined })) });
  }
  return null;
}

async function handleInboundWebhook(req, res, url) {
  if (!url.pathname.startsWith('/api/webhooks/inbound/') || req.method !== 'POST') return null;
  const ctx = await verifyApiKey(req, store);
  if (!ctx) return sendJson(req, res, 401, { ok: false, error: 'API key invalida.' });

  const source = decodeURIComponent(url.pathname.replace('/api/webhooks/inbound/', '')) || 'webhook';
  const body = await readBody(req);
  const lead = await store.insert('leads', {
    nome: body.nome || body.name || body.full_name || 'Lead sem nome',
    telefone: body.telefone || body.phone || body.whatsapp || null,
    email: body.email || null,
    origem_nome: source,
    origem_lead: source,
    midia: body.utm_medium || body.channel || null,
    campanha: body.utm_campaign || body.campaign || null,
    utm_source: body.utm_source || source,
    utm_medium: body.utm_medium || null,
    utm_campaign: body.utm_campaign || null,
    utm_content: body.utm_content || null,
    utm_term: body.utm_term || null,
    pagina_entrada: body.landing_page || body.page || null,
    formulario_origem: body.form || body.form_id || null,
    status: 'novo',
    etapa: 'Novo Lead',
    campos_extras: body
  }, ctx, RESOURCES.leads);
  await store.insert('webhooks_logs', { tipo: source, direction: 'inbound', status: 'processed', payload: body, response: { lead_id: lead.id } }, ctx, RESOURCES.webhooks_logs).catch(() => null);
  return sendJson(req, res, 201, { ok: true, data: lead });
}

async function audit(ctx, action, entity, entityId, changes) {
  if (!ctx || ctx.system) return;
  try {
    await store.insert('audit_logs', {
      usuario_id: ctx.profile && ctx.profile.id,
      acao: action,
      entidade: entity,
      entidade_id: entityId || null,
      depois: changes || {},
      ip: ctx.ip || null
    }, ctx, RESOURCES.audit_logs);
  } catch (_) {}
}

async function handleStatic(req, res, url) {
  let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  let filePath = path.join(PUBLIC_DIR, requested);
  const publicRoot = path.resolve(PUBLIC_DIR);
  if (!path.resolve(filePath).startsWith(publicRoot)) return sendText(req, res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendText(req, res, 404, 'Not found');

  if (path.extname(filePath).toLowerCase() === '.html') {
    const html = fs.readFileSync(filePath, 'utf8');
    return sendText(req, res, 200, injectRuntimeConfig(html, req), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  return serveFile(req, res, filePath);
}

async function handleRequest(req, res) {
  const reqOrigin = req.headers.origin;
  try {
    if (!checkRateLimit(req)) return sendJson(req, res, 429, { ok: false, error: 'Muitas requisicoes. Tente novamente em instantes.' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...corsHeaders(reqOrigin), ...securityHeaders() });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    req.protocol = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];

    const publicResult = await handlePublic(req, res, url);
    if (publicResult !== null) return publicResult;

    const inbound = await handleInboundWebhook(req, res, url);
    if (inbound !== null) return inbound;

    if (url.pathname.startsWith('/api/')) {
      const ctx = await requireAuth(req, store);
      ctx.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

      const handlers = [handleAuth, handleApiKeys, handleReports, handleSettings, handleIntegrations, handleBilling, handleCrud];
      for (const handler of handlers) {
        const result = await handler(req, res, url, ctx);
        if (result !== null) return result;
      }

      return sendJson(req, res, 404, { ok: false, error: 'Rota nao encontrada.' });
    }

    return handleStatic(req, res, url);
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    const message = status >= 500 ? 'Erro interno da API.' : error.message;
    if (status >= 500) console.error('[api]', error);
    return sendJson(req, res, status, { ok: false, error: message });
  }
}

function createServer() {
  return http.createServer(handleRequest);
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`R2R CRM SaaS API rodando em http://${HOST}:${PORT}`);
    console.log(`[boot] versao      = ${VERSION}`);
    console.log(`[boot] storage     = ${store.kind}`);
    console.log(`[boot] public_dir  = ${PUBLIC_DIR}`);
    console.log(`[boot] host        = ${HOST}`);
    console.log(`[boot] supabase    = ${process.env.SUPABASE_URL ? 'configurado parcialmente' : 'nao configurado'}`);
  });
}

module.exports = { createServer, publicConfig, injectRuntimeConfig, VERSION };

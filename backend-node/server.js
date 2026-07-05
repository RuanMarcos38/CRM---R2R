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

const { loadEnv, boolEnv, listEnv, numberEnv } = require('./src/env');
loadEnv();

const { readBody, sendJson, sendText, serveFile, cleanUrl } = require('./src/http');
const { corsHeaders, checkRateLimit, securityHeaders, stripSensitiveFields, randomToken } = require('./src/security');
const { createStore } = require('./src/store');
const { resolveAuthContext, requireAuth, verifyApiKey } = require('./src/auth');
const { RESOURCES, resourceForPath } = require('./src/resources');
const { buildReportsSummary } = require('./src/reports');
const { normalizePlanId, publicBillingPlans, checkoutUrlForPlan, whatsappCheckoutFallback, saveBillingWebhookLog } = require('./src/billing');
const { integrationStatus, openAIChat, normalizeEvolutionConfig, evolutionRequest, metaRequest, googleStatus } = require('./src/integrations');
const {
  assertFeatureEnabled,
  assertResourceAccess,
  apiKeyAllows,
  featureForPath,
  featureMap,
  globalIntegrationFallbackAllowed,
  isCompanyAdmin
} = require('./src/access');

const VERSION = '2026.07.05-evolution-admin-fallback';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = resolvePublicDir();
const store = createStore();

function demoAuthEnabled() {
  return boolEnv('ALLOW_DEMO_AUTH', store.kind === 'local' && process.env.NODE_ENV !== 'production');
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
  const candidates = [
    process.env.PUBLIC_DIR,
    path.join(__dirname, 'frontend'),
    path.join(__dirname, '..', 'frontend'),
    path.join(__dirname, '..', 'frontend-public_html'),
    __dirname
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
    } catch (_) {}
  }
  return path.resolve(__dirname);
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || body.usuario || body.username || '').trim().toLowerCase();
  const password = String(body.password || body.senha || '');

  if (!email || !password) {
    return sendJson(req, res, 400, { ok: false, success: false, error: 'Informe email e senha.' });
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
    cors_origins: listEnv('CORS_ORIGIN', ['*'])
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
  const allowGlobal = globalIntegrationFallbackAllowed(ctx);
  const cfg = normalizeEvolutionConfig({
    url: saved.url || (allowGlobal ? process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || '' : ''),
    key: saved.key || saved.apiKey || saved.api_key || saved.apikey || (allowGlobal ? process.env.EVOLUTION_API_KEY || '' : ''),
    instance: saved.instance || saved.inst || (allowGlobal ? process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE : '') || 'r2r-crm'
  });
  return { ...cfg, source: row ? 'database' : 'env', row };
}

function getWhatsappEnvFallbackConfig(ctx, currentConfig = {}) {
  const canUseFallback = globalIntegrationFallbackAllowed(ctx) || isCompanyAdmin(ctx);
  if (!canUseFallback) return null;
  const envUrl = cleanUrl(process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || '');
  const envKey = String(process.env.EVOLUTION_API_KEY || '').trim();
  const currentUrl = cleanUrl(currentConfig.url || '');
  if (!envKey) return null;
  if (currentUrl && envUrl && currentUrl !== envUrl && !globalIntegrationFallbackAllowed(ctx)) return null;
  const cfg = normalizeEvolutionConfig({
    url: currentUrl || envUrl,
    key: envKey,
    instance: currentConfig.instance || process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || 'r2r-crm'
  });
  if (!cfg.url || !cfg.key) return null;
  if (cfg.url === currentConfig.url && cfg.key === currentConfig.key && cfg.instance === currentConfig.instance) return null;
  return { ...cfg, source: 'env_fallback', row: currentConfig.row || null };
}

function shouldRetryWhatsappWithEnv(result) {
  return !!(result && (
    result.status === 'auth_error' ||
    result.remote_status === 401 ||
    result.remote_status === 403 ||
    /HTTP\s*(401|403)|recusou autenticacao/i.test(String(result.error || result.message || ''))
  ));
}

async function evolutionRequestWithFallback(ctx, pathname, method = 'GET', body, cfg = null) {
  const primaryCfg = cfg || await getWhatsappConfig(ctx);
  const result = await evolutionRequest(pathname, method, body, primaryCfg);
  if (!shouldRetryWhatsappWithEnv(result)) return result;

  const fallbackCfg = getWhatsappEnvFallbackConfig(ctx, primaryCfg);
  if (!fallbackCfg) return result;

  const fallback = await evolutionRequest(pathname, method, body, fallbackCfg);
  if (fallback && fallback.ok !== false) {
    return {
      ...fallback,
      credential_source: 'env_fallback',
      message: fallback.message || 'Evolution conectada usando a credencial global do backend.'
    };
  }
  return {
    ...result,
    fallback_attempted: true,
    fallback_error: fallback && (fallback.error || fallback.message) || 'Credencial global tambem falhou.',
    error: 'Evolution API recusou a API Key salva e tambem a EVOLUTION_API_KEY do EasyPanel.',
    message: 'Evolution API recusou autenticacao. Atualize a API Key Global da Evolution no EasyPanel/CRM e tente novamente.'
  };
}

function hasInlineWhatsappConfig(body) {
  return !!(body && (body.url || body.evolution_url || body.apiKey || body.api_key || body.apikey || body.key || body.instance || body.inst || body.instanceName));
}

function mergeWhatsappConfig(savedConfig, body) {
  const inline = normalizeEvolutionConfig(body || {});
  return normalizeEvolutionConfig({
    url: inline.url || savedConfig.url || '',
    key: inline.key || savedConfig.key || '',
    instance: inline.instance || savedConfig.instance || 'r2r-crm'
  });
}

function billingWebhookSecret() {
  return String(process.env.BILLING_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
}

function authorizeBillingWebhook(req, url) {
  const secret = billingWebhookSecret();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const provided = firstText(
    req.headers['x-billing-secret'],
    req.headers['x-webhook-secret'],
    req.headers['x-payment-secret'],
    url.searchParams.get('secret')
  );
  return provided && provided === secret;
}

function normalizeIntegrationType(value) {
  const type = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return ({
    ia: 'ai',
    openai: 'ai',
    inteligencia: 'ai',
    metaads: 'meta',
    'meta-ads': 'meta',
    'meta-wa': 'meta',
    whatsappmeta: 'meta',
    webhook: 'n8n'
  }[type] || type);
}

function integrationTypeFromPath(pathname) {
  const match = String(pathname || '').match(/^\/api\/integrations\/([a-zA-Z0-9_-]+)$/);
  return match ? normalizeIntegrationType(match[1]) : '';
}

function integrationDisplayName(type) {
  return ({
    ai: 'Inteligencia Artificial',
    n8n: 'N8N',
    meta: 'Meta',
    google: 'Google',
    whaticket: 'Whaticket'
  })[type] || type;
}

async function getIntegrationConfig(ctx, type) {
  const normalized = normalizeIntegrationType(type);
  const rows = await store.list('integracoes', { 'eq.tipo': normalized, limit: 1 }, ctx, integrationResource()).catch(() => []);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const config = row && row.config && typeof row.config === 'object' ? row.config : {};
  if (!row && !globalIntegrationFallbackAllowed(ctx)) {
    return { type: normalized, row: null, config: { __disableEnv: true } };
  }
  return {
    type: normalized,
    row,
    config
  };
}

async function saveIntegrationConfig(ctx, type, body) {
  const normalized = normalizeIntegrationType(type);
  const current = await getIntegrationConfig(ctx, normalized);
  const input = body && typeof body === 'object' ? body : {};
  const currentConfig = current && current.config && typeof current.config === 'object' ? current.config : {};
  delete currentConfig.__disableEnv;
  const source = input.config && typeof input.config === 'object' ? { ...input.config, ...input } : { ...input };
  delete source.config;
  delete source.tipo;
  delete source.nome;

  [
    'apiKey',
    'api_key',
    'key',
    'token',
    'accessToken',
    'access_token',
    'clientSecret',
    'client_secret'
  ].forEach(field => {
    if (source[field] === '' || source[field] == null) delete source[field];
  });

  const payload = {
    tipo: normalized,
    nome: input.nome || input.name || (current.row && current.row.nome) || integrationDisplayName(normalized),
    ativa: input.ativa !== false && input.active !== false,
    config: {
      ...currentConfig,
      provider: input.provider || source.provider || currentConfig.provider || normalized,
      ...source,
      updated_at: new Date().toISOString()
    }
  };
  const resource = integrationResource({ allowSensitive: true });
  return current.row
    ? await store.update('integracoes', current.row.id, payload, ctx, resource)
    : await store.insert('integracoes', payload, ctx, resource);
}

function publicIntegrationResponse(row, type) {
  const cfg = row && row.config && typeof row.config === 'object' ? row.config : {};
  return {
    ok: true,
    success: true,
    configured: !!row,
    type: normalizeIntegrationType(type),
    data: row ? safeData(row) : null,
    config: {
      provider: cfg.provider || normalizeIntegrationType(type),
      url: cfg.url || cfg.webhookUrl || cfg.webhook_url || '',
      model: cfg.model || cfg.modelo || '',
      active: row ? row.ativa !== false : false,
      has_api_key: !!(cfg.apiKey || cfg.api_key || cfg.key),
      has_token: !!(cfg.token || cfg.accessToken || cfg.access_token),
      has_webhook: !!(cfg.webhookUrl || cfg.webhook_url || cfg.webhook || cfg.url)
    }
  };
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

function safeFileName(value) {
  const base = path.basename(String(value || 'arquivo').trim() || 'arquivo');
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'arquivo';
}

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads'));
}

function allowedUploadTypes() {
  return listEnv('UPLOAD_ALLOWED_MIME_TYPES', [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv'
  ]);
}

function decodeBase64Upload(body) {
  const raw = String(body.content_base64 || body.base64 || body.file_base64 || '');
  if (!raw) return null;
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  return {
    mimeFromDataUrl: match ? match[1] : '',
    buffer: Buffer.from(match ? match[2] : raw, 'base64')
  };
}

function assertInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    const error = new Error('Caminho de arquivo invalido.');
    error.statusCode = 400;
    throw error;
  }
  return resolvedTarget;
}

function firstText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function extractMessageText(message = {}) {
  return firstText(
    message.conversation,
    message.extendedTextMessage && message.extendedTextMessage.text,
    message.imageMessage && message.imageMessage.caption,
    message.videoMessage && message.videoMessage.caption,
    message.documentMessage && message.documentMessage.caption,
    message.buttonsResponseMessage && message.buttonsResponseMessage.selectedDisplayText,
    message.listResponseMessage && message.listResponseMessage.title
  );
}

function extractEvolutionWebhook(body) {
  const data = body && (body.data || body.message || body.messages || body);
  const item = Array.isArray(data) ? data[0] : data || {};
  const key = item.key || item.messageKey || {};
  const remoteJid = firstText(key.remoteJid, item.remoteJid, item.chatId, item.from, item.sender);
  const externalId = firstText(key.id, item.id, item.messageId, body && body.messageId);
  const instance = firstText(body && body.instance, body && body.instanceName, item.instance, item.instanceName);
  const pushName = firstText(item.pushName, item.senderName, item.notifyName, item.name);
  const message = item.message || item.content || {};
  const text = firstText(item.text, item.body, extractMessageText(message));
  const timestamp = item.messageTimestamp || item.timestamp || body && body.date_time || null;
  const number = remoteJid ? remoteJid.split('@')[0].replace(/\D/g, '') : '';

  return {
    event: firstText(body && body.event, body && body.type, item.event) || 'message',
    instance,
    remoteJid,
    externalId,
    pushName,
    text,
    number,
    fromMe: Boolean(key.fromMe || item.fromMe),
    timestamp
  };
}

async function authorizeEvolutionWebhook(req, url) {
  const configuredSecret = String(process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
  if (configuredSecret) {
    const provided = firstText(req.headers['x-evolution-secret'], req.headers['x-webhook-secret'], url.searchParams.get('secret'));
    if (provided !== configuredSecret) {
      const error = new Error('Webhook Evolution nao autorizado.');
      error.statusCode = 401;
      throw error;
    }
    return null;
  }

  const apiCtx = await verifyApiKey(req, store);
  if (apiCtx) {
    if (!apiKeyAllows(apiCtx, 'webhooks', 'inbound')) {
      const error = new Error('API key sem permissao para webhooks.');
      error.statusCode = 403;
      throw error;
    }
    return apiCtx;
  }

  const error = new Error('Configure EVOLUTION_WEBHOOK_SECRET ou envie x-api-key de uma empresa.');
  error.statusCode = 401;
  throw error;
}

async function resolveEvolutionContext(req, url, body) {
  const apiCtx = await authorizeEvolutionWebhook(req, url);
  if (apiCtx) return apiCtx;

  const parsed = extractEvolutionWebhook(body);
  let empresaId = String(process.env.EVOLUTION_WEBHOOK_EMPRESA_ID || '').trim();
  const instance = parsed.instance || process.env.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE || '';

  if (!empresaId && instance) {
    const rows = await store.list('integracoes', { 'eq.tipo': 'whatsapp', limit: 500 }, { system: true }, integrationResource({ allowSensitive: true })).catch(() => []);
    const matches = rows.filter(row => {
      const cfg = row.config && typeof row.config === 'object' ? row.config : {};
      return [cfg.instance, cfg.inst, cfg.instanceName].filter(Boolean).includes(instance);
    });
    if (matches.length > 1) {
      const error = new Error('Instancia Evolution vinculada a mais de uma empresa. Configure EVOLUTION_WEBHOOK_EMPRESA_ID ou use instancias unicas por empresa.');
      error.statusCode = 409;
      throw error;
    }
    if (matches.length === 1) empresaId = matches[0].empresa_id;
  } else if (!empresaId) {
    const rows = await store.list('integracoes', { 'eq.tipo': 'whatsapp', limit: 2 }, { system: true }, integrationResource({ allowSensitive: true })).catch(() => []);
    if (rows.length === 1) empresaId = rows[0].empresa_id;
  }

  if (!empresaId) {
    const error = new Error('Nao foi possivel identificar a empresa do webhook Evolution. Configure EVOLUTION_WEBHOOK_EMPRESA_ID ou salve a integracao com a instancia correta.');
    error.statusCode = 422;
    throw error;
  }

  return {
    empresaId,
    profile: null,
    user: { id: 'evolution-webhook', email: null },
    permissions: { tipo: 'webhook', admin: false, super_admin: false, can_write: true, custom: {} }
  };
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
    if (!authorizeBillingWebhook(req, url)) {
      return sendJson(req, res, 401, { ok: false, error: 'Webhook de cobranca nao autorizado.' });
    }
    const body = await readBody(req);
    await store.insert('billing_webhooks', {
      empresa_id: body.empresa_id || body.tenant_id || body.company_id || null,
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
    const features = await featureMap(store, ctx);
    return sendJson(req, res, 200, {
      ok: true,
      success: true,
      user: ctx.user,
      profile: ctx.profile,
      empresa_id: ctx.empresaId,
      permissions: ctx.permissions,
      features
    });
  }
  if (url.pathname === '/api/features' && req.method === 'GET') {
    return sendJson(req, res, 200, { ok: true, success: true, features: await featureMap(store, ctx) });
  }
  if (url.pathname === '/api/features' && (req.method === 'POST' || req.method === 'PUT')) {
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode alterar funcionalidades.' });
    const body = await readBody(req);
    const featureName = String(body.feature_name || body.feature || body.name || '').trim();
    if (!featureName) return sendJson(req, res, 400, { ok: false, error: 'Informe feature_name.' });
    const current = await store.list('feature_flags', { 'eq.feature_name': featureName, limit: 1 }, ctx, RESOURCES.feature_flags).catch(() => []);
    const payload = { feature_name: featureName, enabled: body.enabled !== false };
    const row = current && current[0]
      ? await store.update('feature_flags', current[0].id, payload, ctx, RESOURCES.feature_flags)
      : await store.insert('feature_flags', payload, ctx, RESOURCES.feature_flags);
    await audit(ctx, 'feature_flag_upsert', 'feature_flags', row && row.id, payload);
    return sendJson(req, res, 200, { ok: true, success: true, data: row, features: await featureMap(store, ctx) });
  }
  return null;
}

async function handleCrud(req, res, url, ctx) {
  const resource = resourceForPath(url.pathname);
  if (!resource) return null;

  assertResourceAccess(ctx, resource, req.method);
  await assertFeatureEnabled(store, ctx, featureForPath(url.pathname, resource));

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
  if ((url.pathname === '/api/reports/summary' || url.pathname === '/api/reports/dashboard') && req.method === 'GET') {
    const summary = await buildReportsSummary(store, ctx, Object.fromEntries(url.searchParams.entries()));
    return sendJson(req, res, 200, { ok: true, success: true, data: summary });
  }
  return null;
}

async function handleSettings(req, res, url, ctx) {
  if (url.pathname !== '/api/settings') return null;
  if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, success: false, error: 'Somente Administrador da Empresa pode alterar configuracoes.' });

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
    await audit(ctx, 'settings_update', 'configuracoes', null, body);
    return sendJson(req, res, 200, { ok: true, success: true, data: saved });
  }

  return sendJson(req, res, 405, { ok: false, success: false, error: 'Metodo nao permitido.' });
}

async function handleFiles(req, res, url, ctx) {
  if ((url.pathname === '/api/files/upload' || url.pathname === '/api/arquivos/upload') && req.method === 'POST') {
    if (!ctx.permissions.can_write) return sendJson(req, res, 403, { ok: false, error: 'Permissao insuficiente para enviar arquivos.' });
    const body = await readBody(req);
    const upload = decodeBase64Upload(body);
    if (!upload || !upload.buffer.length) return sendJson(req, res, 400, { ok: false, error: 'Envie content_base64 com o arquivo em Base64.' });

    const maxBytes = numberEnv('UPLOAD_MAX_BYTES', 10_000_000);
    if (upload.buffer.length > maxBytes) return sendJson(req, res, 413, { ok: false, error: 'Arquivo acima do limite permitido.' });

    const mimeType = String(body.mime_type || body.type || upload.mimeFromDataUrl || 'application/octet-stream').trim().toLowerCase();
    if (!allowedUploadTypes().includes(mimeType)) {
      return sendJson(req, res, 415, { ok: false, error: 'Tipo de arquivo nao permitido.' });
    }

    const root = uploadRoot();
    const companyDir = assertInsideRoot(root, path.join(root, ctx.empresaId || 'sem-empresa'));
    fs.mkdirSync(companyDir, { recursive: true });

    const originalName = safeFileName(body.nome || body.name || body.filename || 'arquivo');
    const storedName = `${Date.now()}-${randomToken('file').slice(5, 17)}-${originalName}`;
    const absolutePath = assertInsideRoot(root, path.join(companyDir, storedName));
    fs.writeFileSync(absolutePath, upload.buffer, { flag: 'wx' });

    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
    const row = await store.insert('arquivos', {
      nome: originalName,
      path: relativePath,
      mime_type: mimeType,
      size_bytes: upload.buffer.length,
      lead_id: body.lead_id || null,
      cliente_id: body.cliente_id || body.client_id || null,
      oportunidade_id: body.oportunidade_id || null,
      uploaded_by: ctx.profile && ctx.profile.id || null
    }, ctx, RESOURCES.arquivos);

    await audit(ctx, 'file_upload', 'arquivos', row && row.id, { nome: originalName, mime_type: mimeType, size_bytes: upload.buffer.length });
    return sendJson(req, res, 201, { ok: true, success: true, data: safeData(row) });
  }

  const downloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
  if (downloadMatch && req.method === 'GET') {
    const row = await store.get('arquivos', decodeURIComponent(downloadMatch[1]), ctx, RESOURCES.arquivos);
    if (!row) return sendJson(req, res, 404, { ok: false, error: 'Arquivo nao encontrado.' });
    const root = uploadRoot();
    const filePath = assertInsideRoot(root, path.join(root, row.path || ''));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(req, res, 404, { ok: false, error: 'Arquivo fisico nao encontrado.' });
    return serveFile(req, res, filePath);
  }

  return null;
}

async function handleEvolutionWebhook(req, res, url) {
  if (!['/api/webhooks/evolution', '/api/evolution/webhook'].includes(url.pathname) || req.method !== 'POST') return null;
  const body = await readBody(req);
  const ctx = await resolveEvolutionContext(req, url, body);
  const parsed = extractEvolutionWebhook(body);
  const result = { event: parsed.event, instance: parsed.instance || null, message_saved: false, duplicate: false };

  if (parsed.remoteJid) {
    const duplicate = parsed.externalId
      ? await store.list('mensagens', { 'eq.external_id': parsed.externalId, limit: 1 }, ctx, RESOURCES.mensagens).catch(() => [])
      : [];

    if (duplicate && duplicate.length) {
      result.duplicate = true;
    } else {
      const conversations = await store.list('conversas', { 'eq.external_id': parsed.remoteJid, limit: 1 }, ctx, RESOURCES.conversas).catch(() => []);
      let conversa = conversations && conversations[0];
      if (!conversa) {
        conversa = await store.insert('conversas', {
          canal: 'whatsapp',
          wa_contact_id: parsed.number || parsed.remoteJid,
          external_id: parsed.remoteJid,
          status: 'aberta',
          ultima_mensagem: parsed.text || `[${parsed.event}]`,
          ultima_mensagem_em: new Date().toISOString(),
          nao_lidas: parsed.fromMe ? 0 : 1,
          metadata: { instance: parsed.instance, push_name: parsed.pushName }
        }, ctx, RESOURCES.conversas);
      }

      const mensagem = await store.insert('mensagens', {
        conversa_id: conversa.id,
        direcao: parsed.fromMe ? 'outbound' : 'inbound',
        canal: 'whatsapp',
        tipo: parsed.text ? 'text' : parsed.event,
        texto: parsed.text || '',
        external_id: parsed.externalId || null,
        status: parsed.fromMe ? 'sent' : 'received',
        metadata: {
          instance: parsed.instance,
          remote_jid: parsed.remoteJid,
          push_name: parsed.pushName,
          timestamp: parsed.timestamp,
          event: parsed.event
        }
      }, ctx, RESOURCES.mensagens);

      await store.update('conversas', conversa.id, {
        ultima_mensagem: parsed.text || conversa.ultima_mensagem || `[${parsed.event}]`,
        ultima_mensagem_em: new Date().toISOString(),
        nao_lidas: parsed.fromMe ? Number(conversa.nao_lidas || 0) : Number(conversa.nao_lidas || 0) + 1
      }, ctx, RESOURCES.conversas).catch(() => null);

      result.message_saved = true;
      result.mensagem_id = mensagem && mensagem.id;
      result.conversa_id = conversa.id;
    }
  }

  await store.insert('webhooks_logs', {
    tipo: 'evolution',
    direction: 'inbound',
    status: result.message_saved || result.duplicate ? 'processed' : 'received',
    payload: body,
    response: result
  }, ctx, RESOURCES.webhooks_logs).catch(() => null);

  return sendJson(req, res, 200, { ok: true, success: true, data: result });
}

async function handleIntegrations(req, res, url, ctx) {
  if (url.pathname === '/api/integrations/status' && req.method === 'GET') {
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode consultar status de integracoes.' });
    return sendJson(req, res, 200, { ok: true, success: true, integrations: integrationStatus() });
  }

  const genericIntegrationType = integrationTypeFromPath(url.pathname);
  if (genericIntegrationType && !['whatsapp', 'evolution', 'google'].includes(genericIntegrationType)) {
    const integrationFeature = ({ ai: 'ai', n8n: 'n8n', meta: 'meta_ads' })[genericIntegrationType] || '';
    await assertFeatureEnabled(store, ctx, integrationFeature);
    if (req.method === 'GET') {
      const current = await getIntegrationConfig(ctx, genericIntegrationType);
      return sendJson(req, res, 200, publicIntegrationResponse(current.row, genericIntegrationType));
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, success: false, error: 'Somente Administrador da Empresa pode configurar integracoes.' });
      const row = await saveIntegrationConfig(ctx, genericIntegrationType, await readBody(req));
      await audit(ctx, 'integration_save', 'integracoes', row && row.id, { type: genericIntegrationType });
      return sendJson(req, res, 200, {
        ...publicIntegrationResponse(row, genericIntegrationType),
        configured: true,
        message: `${integrationDisplayName(genericIntegrationType)} salvo no backend.`
      });
    }
  }

  if (url.pathname === '/api/ai/test' && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'ai');
    const ai = await getIntegrationConfig(ctx, 'ai');
    try {
      const out = await openAIChat('Responda apenas: IA conectada com sucesso.', [], { ...ctx, aiConfig: ai.config });
      return sendJson(req, res, 200, { ok: true, ...out });
    } catch (error) {
      return sendJson(req, res, 200, { ok: false, success: false, configured: true, error: error.message, message: 'IA configurada, mas o provedor recusou o teste.' });
    }
  }

  if (url.pathname === '/api/ai/chat' && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'ai');
    const body = await readBody(req);
    let history = body.history || [];
    if (body.lead_id) {
      const lead = await store.get('leads', body.lead_id, ctx, RESOURCES.leads).catch(() => null);
      const activities = await store.list('atividades', { 'eq.lead_id': body.lead_id, limit: 10, order: 'created_at.desc' }, ctx, RESOURCES.atividades).catch(() => []);
      if (lead) {
        history = [
          {
            role: 'system',
            content: 'Contexto do lead no CRM: ' + JSON.stringify({
              nome: lead.nome,
              empresa: lead.empresa,
              origem: lead.origem_nome || lead.origem_lead,
              etapa: lead.etapa,
              status: lead.status,
              temperatura: lead.temperatura,
              score: lead.score,
              historico_recente: activities.map(item => ({ tipo: item.tipo, descricao: item.descricao, created_at: item.created_at }))
            })
          },
          ...(Array.isArray(history) ? history : [])
        ];
      }
    }
    const ai = await getIntegrationConfig(ctx, 'ai');
    let out;
    try {
      out = await openAIChat(body.message || body.text || 'Ola', history, { ...ctx, aiConfig: ai.config });
    } catch (error) {
      return sendJson(req, res, 200, { ok: false, success: false, configured: true, error: error.message, reply: 'IA configurada, mas o provedor recusou a requisicao. Verifique API key/modelo no backend.' });
    }
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
    await assertFeatureEnabled(store, ctx, 'whatsapp');
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
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode configurar o WhatsApp.' });
    const row = await saveWhatsappConfig(ctx, await readBody(req));
    const cfg = row.config || {};
    await audit(ctx, 'integration_save', 'integracoes', row && row.id, { type: 'whatsapp' });
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
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const result = await evolutionRequestWithFallback(ctx, '/instance/fetchInstances', 'GET', null);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/integrations/evolution/status' && req.method === 'GET') {
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const result = await evolutionRequestWithFallback(ctx, '/instance/fetchInstances', 'GET', null);
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/connect' || url.pathname === '/api/integrations/evolution/connect') && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const body = await readBody(req);
    if (hasInlineWhatsappConfig(body) && !isCompanyAdmin(ctx)) {
      return sendJson(req, res, 403, { ok: false, success: false, error: 'Somente admin pode usar credenciais inline da Evolution API.' });
    }
    const savedCfg = await getWhatsappConfig(ctx);
    const cfg = hasInlineWhatsappConfig(body) ? mergeWhatsappConfig(savedCfg, body) : savedCfg;
    const result = await evolutionRequestWithFallback(ctx, '/instance/connect', 'POST', body, cfg);
    await audit(ctx, 'whatsapp_connect', 'integracoes', savedCfg.row && savedCfg.row.id, { status: result.status, instance: cfg.instance });
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/integrations/evolution/qrcode' && req.method === 'GET') {
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const result = await evolutionRequestWithFallback(ctx, '/instance/connect', 'POST', {});
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/disconnect' || url.pathname === '/api/integrations/evolution/disconnect') && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const body = await readBody(req);
    const cfg = await getWhatsappConfig(ctx);
    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');
    const result = await evolutionRequestWithFallback(ctx, `/instance/logout/${instance}`, 'DELETE', null, cfg);
    await audit(ctx, 'whatsapp_disconnect', 'integracoes', cfg.row && cfg.row.id, { status: result.status, instance: cfg.instance });
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/whatsapp/send' || url.pathname === '/api/messages/send') && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'whatsapp');
    const body = await readBody(req);
    const text = String(body.text || body.message || '').trim();
    const number = String(body.number || body.telefone || body.phone || '').replace(/\D/g, '');
    if (!number || !text) return sendJson(req, res, 400, { ok: false, success: false, error: 'Informe number/telefone e text/message.' });
    const cfg = await getWhatsappConfig(ctx);
    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');
    const result = await evolutionRequestWithFallback(ctx, `/message/sendText/${instance}`, 'POST', {
      number,
      textMessage: { text }
    }, cfg);
    await audit(ctx, 'whatsapp_send', 'mensagens', null, { number, status: result.status });
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/meta/status' && req.method === 'GET') {
    await assertFeatureEnabled(store, ctx, 'meta_ads');
    const meta = await getIntegrationConfig(ctx, 'meta');
    const result = await metaRequest('/me?fields=id,name', meta.config);
    return sendJson(req, res, 200, result);
  }

  if (url.pathname === '/api/meta/campaigns' && req.method === 'GET') {
    await assertFeatureEnabled(store, ctx, 'meta_ads');
    const meta = await getIntegrationConfig(ctx, 'meta');
    const accountId = meta.config.adAccountId || meta.config.ad_account_id || (globalIntegrationFallbackAllowed(ctx) ? process.env.META_AD_ACCOUNT_ID : '') || '';
    if (!accountId) return sendJson(req, res, 200, { ok: true, configured: false, data: [], message: 'Configure META_AD_ACCOUNT_ID no backend.' });
    const fields = 'name,status,objective,daily_budget,lifetime_budget,insights{spend,reach,impressions,clicks,actions}';
    const result = await metaRequest(`/${encodeURIComponent(accountId)}/campaigns?fields=${encodeURIComponent(fields)}&limit=50`, meta.config);
    return sendJson(req, res, 200, result);
  }

  if ((url.pathname === '/api/google/status' || url.pathname === '/api/integrations/google/status') && req.method === 'GET') {
    return sendJson(req, res, 200, googleStatus());
  }

  if (url.pathname === '/api/n8n/test' && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'n8n');
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode testar N8N.' });
    const n8n = await getIntegrationConfig(ctx, 'n8n');
    const webhook = n8n.config.webhookUrl || n8n.config.webhook_url || n8n.config.webhook || (globalIntegrationFallbackAllowed(ctx) ? process.env.N8N_WEBHOOK_URL : '') || n8n.config.url || '';
    if (!webhook) return sendJson(req, res, 200, { ok: true, configured: false, message: 'N8N_WEBHOOK_URL nao configurado.' });
    const payload = { test: true, source: 'r2r-crm', empresa_id: ctx.empresaId, at: new Date().toISOString() };
    try {
      const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return sendJson(req, res, 200, { ok: true, configured: true, status: response.status });
    } catch (error) {
      return sendJson(req, res, 200, { ok: false, success: false, configured: true, status: 'unreachable', error: error.message, message: 'N8N configurado, mas o webhook nao respondeu.' });
    }
  }

  return null;
}

async function handleBilling(req, res, url, ctx) {
  if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
    await assertFeatureEnabled(store, ctx, 'billing');
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
    await audit(ctx, 'billing_checkout', 'assinaturas', null, { plan_id: planId, configured: !!configuredUrl });
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
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode gerar API keys.' });
    const body = await readBody(req);
    const created = await store.createApiKey(body.nome || body.name || 'Chave API', ctx);
    await audit(ctx, 'api_key_create', 'api_keys', created.publicRow && created.publicRow.id, { nome: body.nome || body.name || 'Chave API' });
    return sendJson(req, res, 201, { ok: true, data: created.publicRow, api_key: created.plainText });
  }

  if (url.pathname === '/api/api-keys' && req.method === 'GET') {
    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode listar API keys.' });
    const rows = await store.list('api_keys', {}, ctx, RESOURCES.api_keys);
    return sendJson(req, res, 200, { ok: true, data: rows.map(r => ({ ...r, key_hash: undefined })) });
  }
  return null;
}

async function handleInboundWebhook(req, res, url) {
  if (!url.pathname.startsWith('/api/webhooks/inbound/') || req.method !== 'POST') return null;
  const ctx = await verifyApiKey(req, store);
  if (!ctx) return sendJson(req, res, 401, { ok: false, error: 'API key invalida.' });
  if (!apiKeyAllows(ctx, 'webhooks', 'inbound')) return sendJson(req, res, 403, { ok: false, error: 'API key sem permissao para webhooks.' });

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
  const resolvedFile = path.resolve(filePath);
  if (resolvedFile !== publicRoot && !resolvedFile.startsWith(publicRoot + path.sep)) return sendText(req, res, 403, 'Forbidden');
  if (!fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).isDirectory()) return sendText(req, res, 404, 'Not found');

  if (path.extname(resolvedFile).toLowerCase() === '.html') {
    const html = fs.readFileSync(resolvedFile, 'utf8');
    return sendText(req, res, 200, injectRuntimeConfig(html, req), { 'Content-Type': 'text/html; charset=utf-8' });
  }

  return serveFile(req, res, resolvedFile);
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

    const evolutionWebhook = await handleEvolutionWebhook(req, res, url);
    if (evolutionWebhook !== null) return evolutionWebhook;

    const inbound = await handleInboundWebhook(req, res, url);
    if (inbound !== null) return inbound;

    if (url.pathname.startsWith('/api/')) {
      const ctx = await requireAuth(req, store);
      ctx.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

      const handlers = [handleAuth, handleApiKeys, handleReports, handleSettings, handleFiles, handleIntegrations, handleBilling, handleCrud];
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
  createServer().listen(PORT, () => {
    console.log(`R2R CRM SaaS API rodando em http://localhost:${PORT}`);
    console.log(`[boot] versao      = ${VERSION}`);
    console.log(`[boot] storage     = ${store.kind}`);
    console.log(`[boot] public_dir  = ${PUBLIC_DIR}`);
    console.log(`[boot] supabase    = ${process.env.SUPABASE_URL ? 'configurado parcialmente' : 'nao configurado'}`);
  });
}

module.exports = { createServer, publicConfig, injectRuntimeConfig, VERSION };

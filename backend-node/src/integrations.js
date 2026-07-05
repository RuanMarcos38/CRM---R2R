const { cleanUrl } = require('./http');

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch (_) {
  QRCode = null;
}

function envFirst(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function evolutionApiKeyFromEnv() {
  return envFirst([
    'EVOLUTION_API_KEY',
    'AUTHENTICATION_API_KEY',
    'EVOLUTION_AUTHENTICATION_API_KEY',
    'GLOBAL_API_KEY',
    'API_KEY'
  ]);
}

function evolutionUsernameFromEnv() {
  return envFirst([
    'EVOLUTION_USERNAME',
    'EVOLUTION_USER',
    'AUTHENTICATION_USERNAME',
    'AUTH_USERNAME',
    'BASIC_AUTH_USER'
  ]);
}

function evolutionPasswordFromEnv() {
  return envFirst([
    'EVOLUTION_PASSWORD',
    'EVOLUTION_PASS',
    'AUTHENTICATION_PASSWORD',
    'AUTH_PASSWORD',
    'BASIC_AUTH_PASSWORD'
  ]);
}

function basicAuthValue(username, password) {
  if (!username || !password) return '';
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

function fetchTimeoutMs() {
  const value = Number(process.env.INTEGRATION_TIMEOUT_MS || 20_000);
  return Number.isFinite(value) && value > 0 ? value : 20_000;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function integrationStatus() {
  const evolutionKey = evolutionApiKeyFromEnv();
  const evolutionUser = evolutionUsernameFromEnv();
  const evolutionPassword = evolutionPasswordFromEnv();
  return {
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },
    evolution: {
      configured: !!((process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL) && (evolutionKey || (evolutionUser && evolutionPassword))),
      instance: envFirst(['EVOLUTION_INSTANCE_NAME', 'EVOLUTION_INSTANCE']) || 'r2r-crm',
      webhook_configured: !!process.env.EVOLUTION_WEBHOOK_SECRET
    },
    meta: {
      configured: !!process.env.META_ACCESS_TOKEN,
      app_configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI),
      ad_account_configured: !!process.env.META_AD_ACCOUNT_ID,
      graph_version: process.env.META_GRAPH_VERSION || 'v20.0'
    },
    google: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
      ads_configured: !!(process.env.GOOGLE_DEVELOPER_TOKEN && process.env.GOOGLE_CUSTOMER_ID)
    },
    n8n: {
      configured: !!process.env.N8N_WEBHOOK_URL
    },
    billing: {
      configured: ['STARTER', 'BUSINESS', 'PREMIUM'].some(plan => !!process.env[`CHECKOUT_${plan}_URL`]),
      provider: process.env.PAYMENT_PROVIDER || 'checkout_link'
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

function extractQr(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith('data:image/')) return text;
    if (/^(iVBOR|\/9j\/|R0lGOD|PHN2Z)/.test(text)) return text;
    return null;
  }
  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  const priority = ['base64', 'qrcode', 'qrCode', 'qr', 'image'];
  for (const key of priority) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = extractQr(value[key], seen);
      if (found) return found;
      if (typeof value[key] === 'string' && key.toLowerCase().includes('qr')) return value[key].trim() || null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractQr(item, seen);
      if (found) return found;
    }
    return null;
  }

  for (const item of Object.values(value)) {
    const found = extractQr(item, seen);
    if (found) return found;
  }
  return null;
}

function extractPairingCode(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (['pairingcode', 'paircode', 'code'].includes(normalized) && typeof item === 'string' && item.trim().length <= 32) {
      return item.trim();
    }
    if (item && typeof item === 'object') {
      const found = extractPairingCode(item, seen);
      if (found) return found;
    }
  }
  return null;
}

function extractQrCodeText(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (normalized === 'code' && typeof item === 'string') {
      const text = item.trim();
      if (text.length > 32 && !/^(iVBOR|\/9j\/|R0lGOD|PHN2Z)/.test(text)) return text;
    }
    if (item && typeof item === 'object') {
      const found = extractQrCodeText(item, seen);
      if (found) return found;
    }
  }
  return null;
}

function evolutionInstanceName(item) {
  return item && (
    item.name ||
    item.instanceName ||
    item.id ||
    item.instance && (item.instance.instanceName || item.instance.name || item.instance.id)
  ) || '';
}

function evolutionConnectionStatus(item) {
  return item && (
    item.connectionStatus ||
    item.status ||
    item.state ||
    item.instance && (item.instance.state || item.instance.status || item.instance.connectionStatus)
  ) || 'not_found';
}

function sameEvolutionInstanceName(a, b) {
  const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return clean(a) && clean(a) === clean(b);
}

function findEvolutionInstance(data, instance) {
  const list = Array.isArray(data) ? data : [];
  return list.find(item => {
    const name = evolutionInstanceName(item);
    return name === instance || sameEvolutionInstanceName(name, instance);
  }) || null;
}

function remoteMessageFromEvolution(data) {
  return String(data && (data.message || data.error || data.raw) || '').slice(0, 300);
}

function normalizeQrDataUrl(value) {
  const qr = extractQr(value);
  if (!qr) return null;
  if (String(qr).startsWith('data:image/')) return qr;
  return `data:image/png;base64,${qr}`;
}

async function qrDataUrlFromEvolutionCode(value) {
  const code = extractQrCodeText(value);
  if (!code || !QRCode || typeof QRCode.toDataURL !== 'function') return null;
  return QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 640,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

function evolutionHeaders(cfg, variant = 'apikey') {
  const headers = { 'Content-Type': 'application/json' };
  if (variant === 'basic') headers.Authorization = basicAuthValue(cfg.username, cfg.password);
  else if (variant === 'bearer') headers.Authorization = `Bearer ${cfg.key}`;
  else if (variant === 'authorization') headers.Authorization = cfg.key;
  else if (variant === 'x-api-key') headers['x-api-key'] = cfg.key;
  else headers.apikey = cfg.key;
  return headers;
}

function evolutionAuthError(response, data, cfg, attempts = []) {
  const status = response && response.status || 401;
  const remoteMessage = data && (data.message || data.error || data.raw) || `HTTP ${status}`;
  return {
    ok: false,
    success: false,
    configured: true,
    connected: false,
    status: 'auth_error',
    error: `Evolution API recusou autenticacao (HTTP ${status}).`,
    message: 'Evolution API recusou a API Key. Confira a API Key Global da Evolution no EasyPanel/CRM, salve novamente e tente conectar.',
    instance: cfg && cfg.instance || 'r2r-crm',
    remote_status: status,
    remote_message: String(remoteMessage || '').slice(0, 300),
    attempts
  };
}

async function evolutionAuthProbe(overrideConfig = null) {
  const cfg = normalizeEvolutionConfig({ ...evolutionConfig(), ...(overrideConfig || {}) });
  const result = {
    configured: !!(cfg.url && (cfg.key || (cfg.username && cfg.password))),
    instance: cfg.instance,
    route: '/instance/fetchInstances',
    attempts: []
  };
  if (!result.configured) return result;

  const variants = [];
  if (cfg.key) variants.push('apikey', 'bearer', 'authorization', 'x-api-key');
  if (cfg.username && cfg.password) variants.push('basic');

  for (const variant of variants) {
    try {
      const response = await fetchWithTimeout(cfg.url + '/instance/fetchInstances', {
        method: 'GET',
        headers: evolutionHeaders(cfg, variant)
      });
      const data = await readJsonResponse(response);
      const remoteMessage = data && (data.message || data.error || data.raw) || '';
      result.attempts.push({
        auth_variant: variant,
        ok: response.ok,
        status: response.status,
        remote_message: String(remoteMessage || '').slice(0, 220)
      });
      if (response.ok) break;
    } catch (error) {
      result.attempts.push({
        auth_variant: variant,
        ok: false,
        status: 'network_error',
        error: String(error && (error.code || error.cause && error.cause.code || error.message) || 'erro desconhecido').slice(0, 220)
      });
    }
  }

  result.authenticated = result.attempts.some(attempt => attempt.ok);
  return result;
}

function evolutionHttpError(response, data, cfg, attempts = []) {
  if (response && (response.status === 401 || response.status === 403)) {
    return evolutionAuthError(response, data, cfg, attempts);
  }
  return {
    ok: false,
    success: false,
    configured: true,
    connected: false,
    status: 'error',
    error: data && (data.message || data.error) || `HTTP ${response && response.status}`,
    raw: data
  };
}

async function evolutionHttp(cfg, pathname, method = 'GET', body) {
  const variants = [];
  if (cfg.key) variants.push('apikey', 'bearer', 'authorization', 'x-api-key');
  if (cfg.username && cfg.password) variants.push('basic');
  let last = null;
  for (const variant of variants) {
    const response = await fetchWithTimeout(cfg.url + pathname, {
      method,
      headers: evolutionHeaders(cfg, variant),
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {})
    });
    const data = await readJsonResponse(response);
    last = { response, data, auth_variant: variant };
    if (response.status !== 401 && response.status !== 403) return last;
  }
  return last || {
    response: { ok: false, status: 401 },
    data: { message: 'Nenhuma credencial da Evolution API disponivel.' },
    auth_variant: 'none'
  };
}

function evolutionNetworkError(error) {
  const detail = String(error && (error.code || error.cause && error.cause.code || error.message) || 'erro desconhecido').slice(0, 180);
  return {
    ok: false,
    success: false,
    configured: true,
    connected: false,
    status: 'unreachable',
    error: error && error.message || 'Falha ao acessar Evolution API.',
    error_detail: detail,
    message: `Evolution API inacessivel pelo backend (${detail}). Verifique URL, DNS/rede do EasyPanel e se a API esta online.`
  };
}

async function openAIChat(message, history = [], ctx = {}) {
  const aiConfig = ctx.aiConfig || ctx.ai_config || {};
  const key = aiConfig.apiKey || aiConfig.api_key || aiConfig.key || process.env.OPENAI_API_KEY;
  const model = aiConfig.model || aiConfig.modelo || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!key) {
    return {
      configured: false,
      model,
      reply: 'Backend conectado. Configure OPENAI_API_KEY no .env para ativar a IA comercial real.'
    };
  }

  const systemPrompt = process.env.AI_SYSTEM_PROMPT || [
    'Voce e um agente comercial de CRM SaaS para empresas de marketing digital.',
    'Responda em portugues do Brasil com tom consultivo, objetivo e humano.',
    'Use contexto de funil, origem, score e historico quando estiver disponivel.'
  ].join(' ');

  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-12)
    .map(item => ({
      role: ['system', 'user', 'assistant'].includes(item && item.role) ? item.role : 'user',
      content: String(item && item.content || '').slice(0, 6000)
    }))
    .filter(item => item.content);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...safeHistory,
    { role: 'user', content: String(message || '') }
  ];

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(process.env.OPENAI_TEMPERATURE || 0.6),
      metadata: ctx.empresaId ? { empresa_id: ctx.empresaId } : undefined
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error((data.error && data.error.message) || `OpenAI HTTP ${response.status}`);
  return { configured: true, model, reply: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || 'Sem resposta da IA.' };
}

function evolutionConfig() {
  return {
    url: cleanUrl(process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || ''),
    key: evolutionApiKeyFromEnv(),
    username: evolutionUsernameFromEnv(),
    password: evolutionPasswordFromEnv(),
    instance: envFirst(['EVOLUTION_INSTANCE_NAME', 'EVOLUTION_INSTANCE']) || 'r2r-crm'
  };
}

function normalizeEvolutionConfig(config = {}) {
  return {
    url: cleanUrl(config.url || config.evolution_url || ''),
    key: config.key || config.apiKey || config.api_key || config.apikey || '',
    username: config.username || config.user || config.login || '',
    password: config.password || config.pass || config.senha || '',
    instance: config.instance || config.inst || config.instanceName || 'r2r-crm'
  };
}

async function evolutionRequest(pathname, method = 'GET', body, overrideConfig = null) {
  const cfg = normalizeEvolutionConfig({ ...evolutionConfig(), ...(overrideConfig || {}) });
  if (!cfg.url || (!cfg.key && !(cfg.username && cfg.password))) {
    return {
      ok: true,
      success: false,
      configured: false,
      connected: false,
      status: 'not_configured',
      instance: cfg.instance,
      message: 'Evolution API nao configurada. Configure EVOLUTION_API_URL, EVOLUTION_API_KEY ou usuario/senha e EVOLUTION_INSTANCE.'
    };
  }

  let path = pathname;
  if (pathname === '/instance/connect') {
    path = `/instance/connect/${encodeURIComponent((body && body.instance) || cfg.instance)}`;
  }

  if (pathname === '/instance/fetchInstances') {
    try {
      const { response, data, auth_variant } = await evolutionHttp(cfg, pathname, 'GET', null);
      if (!response.ok) {
        return evolutionHttpError(response, data, cfg, [{ route: pathname, method: 'GET', status: response.status, ok: false, auth_variant }]);
      }
      const found = findEvolutionInstance(data, cfg.instance);
      const status = evolutionConnectionStatus(found);
      return { ok: true, success: true, configured: true, connected: status === 'open', status, instance: cfg.instance, data: found || null };
    } catch (error) {
      return evolutionNetworkError(error);
    }
  }

  if (pathname === '/instance/connect' && method === 'POST') {
    let instance = (body && body.instance) || cfg.instance;
    const attempts = [];

    try {
      const statusAttempt = await evolutionHttp(cfg, '/instance/fetchInstances', 'GET', null);
      const found = statusAttempt.response && statusAttempt.response.ok ? findEvolutionInstance(statusAttempt.data, instance) : null;
      const foundName = evolutionInstanceName(found);
      const foundStatus = evolutionConnectionStatus(found);
      attempts.push({
        route: '/instance/fetchInstances',
        method: 'GET',
        status: statusAttempt.response.status,
        ok: statusAttempt.response.ok,
        auth_variant: statusAttempt.auth_variant,
        remote_message: remoteMessageFromEvolution(statusAttempt.data),
        instance_found: !!found,
        instance_status: foundStatus
      });
      if (foundName) instance = foundName;
      if (foundStatus === 'open') {
        return {
          ok: true,
          success: true,
          configured: true,
          connected: true,
          status: 'open',
          instance,
          message: 'WhatsApp ja esta conectado na Evolution API.',
          attempts
        };
      }
    } catch (error) {
      attempts.push({ route: '/instance/fetchInstances', method: 'GET', error: error.message });
    }

    const connectPaths = [
      { route: `/instance/connect/${encodeURIComponent(instance)}`, method: 'GET' },
      { route: `/instance/connect/${encodeURIComponent(instance)}`, method: 'POST' },
      { route: `/instance/qrcode/${encodeURIComponent(instance)}?image=true`, method: 'GET' },
      { route: `/instance/qrcode/${encodeURIComponent(instance)}`, method: 'GET' }
    ];

    for (const item of connectPaths) {
      try {
        const out = await evolutionHttp(cfg, item.route, item.method, { instanceName: instance, instance });
        const qr = normalizeQrDataUrl(out.data) || await qrDataUrlFromEvolutionCode(out.data);
        const pairingCode = extractPairingCode(out.data);
        attempts.push({
          route: item.route,
          method: item.method,
          status: out.response.status,
          ok: out.response.ok,
          auth_variant: out.auth_variant,
          remote_message: remoteMessageFromEvolution(out.data),
          data: out.data
        });
        if (out.response.ok && qr) {
          return { ok: true, success: true, configured: true, status: 'qrcode', instance, qrCode: qr, qrcode: qr, qr, pairing_code: pairingCode, route: item.route, raw: out.data, data: out.data, attempts };
        }
        if (out.response.ok && pairingCode) {
          return { ok: true, success: true, configured: true, status: 'pairing_code', instance, pairing_code: pairingCode, route: item.route, raw: out.data, data: out.data, message: 'A Evolution retornou codigo de pareamento, nao QR Code.', attempts };
        }
      } catch (error) {
        attempts.push({ route: item.route, method: item.method, error: error.message });
      }
    }

    const createPayload = { instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' };
    try {
      const createAttempt = { route: '/instance/create', method: 'POST', ...(await evolutionHttp(cfg, '/instance/create', 'POST', createPayload)) };
      createAttempt.status = createAttempt.response && createAttempt.response.status;
      createAttempt.ok = createAttempt.response && createAttempt.response.ok;
      createAttempt.remote_message = remoteMessageFromEvolution(createAttempt.data);
      attempts.push(createAttempt);
      const qr = normalizeQrDataUrl(createAttempt.data) || await qrDataUrlFromEvolutionCode(createAttempt.data);
      if (createAttempt.response && createAttempt.response.ok && qr) {
        return { ok: true, success: true, configured: true, status: 'qrcode', instance, qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(createAttempt.data), route: createAttempt.route, raw: createAttempt.data, data: createAttempt.data, attempts };
      }
    } catch (error) {
      attempts.push({ route: '/instance/create', method: 'POST', error: error.message });
    }

    const authenticated = attempts.some(attempt => attempt.route === '/instance/fetchInstances' && attempt.ok);
    const authFailure = attempts.find(attempt => {
      const status = attempt.status || (attempt.response && attempt.response.status);
      return status === 401 || status === 403;
    });
    if (authFailure && !authenticated) {
      const authStatus = authFailure.status || (authFailure.response && authFailure.response.status);
      return evolutionAuthError(
        { status: authStatus },
        authFailure.data || { message: authFailure.error || `HTTP ${authStatus}` },
        { ...cfg, instance },
        attempts.map(attempt => ({
          route: attempt.route,
          method: attempt.method,
          status: attempt.status || (attempt.response && attempt.response.status) || null,
          ok: attempt.ok || (attempt.response && attempt.response.ok) || false,
          auth_variant: attempt.auth_variant || null,
          remote_message: attempt.remote_message || null,
          error: attempt.error || null
        }))
      );
    }

    const failedAttempts = attempts.filter(attempt => attempt.error);
    const onlyErrors = attempts.length > 0 && failedAttempts.length === attempts.length;
    const firstError = failedAttempts.find(attempt => attempt.error) || {};
    const firstRemoteFailure = attempts.find(attempt => !attempt.ok && !attempt.error && attempt.status);
    return {
      ok: true,
      success: false,
      configured: true,
      connected: false,
      status: onlyErrors ? 'unreachable' : 'qrcode_not_returned',
      qrcode: null,
      qrCode: null,
      qr: null,
      instance,
      message: onlyErrors
        ? `Evolution API inacessivel pelo backend (${String(firstError.error || 'erro de rede').slice(0, 180)}). Verifique URL/dominio no EasyPanel e confirme se a API esta online.`
        : `Evolution autenticou, mas nao liberou QR Code${firstRemoteFailure ? ` (HTTP ${firstRemoteFailure.status}${firstRemoteFailure.remote_message ? `: ${firstRemoteFailure.remote_message}` : ''})` : ''}. Verifique se a instancia existe, se ja esta conectada ou se precisa ser desconectada/recriada na Evolution.`,
      attempts: attempts.map(attempt => ({
        route: attempt.route,
        method: attempt.method,
        status: attempt.status || (attempt.response && attempt.response.status) || null,
        ok: attempt.ok || (attempt.response && attempt.response.ok) || false,
        auth_variant: attempt.auth_variant || null,
        remote_message: attempt.remote_message || null,
        error: attempt.error || null
      }))
    };
  }

  try {
    const { response, data } = await evolutionHttp(cfg, path, method, body);
    if (!response.ok) return evolutionHttpError(response, data, cfg, [{ route: path, method, status: response.status, ok: false }]);
    const qr = normalizeQrDataUrl(data) || await qrDataUrlFromEvolutionCode(data);
    return { ok: true, success: true, configured: true, status: qr ? 'qrcode' : 'ok', qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(data), raw: data, data };
  } catch (error) {
    return evolutionNetworkError(error);
  }
}

async function metaRequest(pathname, overrideConfig = {}) {
  const allowEnv = !overrideConfig.__disableEnv;
  const token = overrideConfig.accessToken || overrideConfig.access_token || overrideConfig.token || overrideConfig.apiKey || overrideConfig.api_key || (allowEnv ? process.env.META_ACCESS_TOKEN : '');
  if (!token) return { ok: true, configured: false, data: null, message: 'META_ACCESS_TOKEN nao configurado.' };
  const separator = pathname.includes('?') ? '&' : '?';
  const version = String(overrideConfig.graphVersion || overrideConfig.graph_version || (allowEnv ? process.env.META_GRAPH_VERSION : '') || 'v20.0').replace(/^\/+/, '');
  const response = await fetchWithTimeout(`https://graph.facebook.com/${version}${pathname}${separator}access_token=${encodeURIComponent(token)}`);
  const data = await readJsonResponse(response);
  if (!response.ok) return { ok: false, configured: true, error: data.error && data.error.message || `HTTP ${response.status}`, raw: data };
  return { ok: true, configured: true, data: data.data || data };
}

function googleStatus() {
  const oauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
  return {
    ok: true,
    configured: oauthConfigured,
    ads_configured: !!(process.env.GOOGLE_DEVELOPER_TOKEN && process.env.GOOGLE_CUSTOMER_ID),
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    message: oauthConfigured ? 'Google OAuth configurado no backend.' : 'Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no backend.'
  };
}

module.exports = { integrationStatus, openAIChat, evolutionConfig, normalizeEvolutionConfig, evolutionRequest, evolutionAuthProbe, metaRequest, googleStatus };

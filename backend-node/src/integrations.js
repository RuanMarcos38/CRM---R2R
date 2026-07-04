const { cleanUrl } = require('./http');

function envFirst(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
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
  return {
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },
    evolution: {
      configured: !!((process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL) && process.env.EVOLUTION_API_KEY),
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

function normalizeQrDataUrl(value) {
  const qr = extractQr(value);
  if (!qr) return null;
  if (String(qr).startsWith('data:image/')) return qr;
  return `data:image/png;base64,${qr}`;
}

async function evolutionHttp(cfg, pathname, method = 'GET', body) {
  const response = await fetchWithTimeout(cfg.url + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: cfg.key },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {})
  });
  const data = await readJsonResponse(response);
  return { response, data };
}

async function openAIChat(message, history = [], ctx = {}) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
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
    key: process.env.EVOLUTION_API_KEY || '',
    instance: envFirst(['EVOLUTION_INSTANCE_NAME', 'EVOLUTION_INSTANCE']) || 'r2r-crm'
  };
}

function normalizeEvolutionConfig(config = {}) {
  return {
    url: cleanUrl(config.url || config.evolution_url || ''),
    key: config.key || config.apiKey || config.api_key || config.apikey || '',
    instance: config.instance || config.inst || config.instanceName || 'r2r-crm'
  };
}

async function evolutionRequest(pathname, method = 'GET', body, overrideConfig = null) {
  const cfg = normalizeEvolutionConfig({ ...evolutionConfig(), ...(overrideConfig || {}) });
  if (!cfg.url || !cfg.key) {
    return {
      ok: true,
      success: false,
      configured: false,
      connected: false,
      status: 'not_configured',
      instance: cfg.instance,
      message: 'Evolution API nao configurada. Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE.'
    };
  }

  let path = pathname;
  if (pathname === '/instance/connect') {
    path = `/instance/connect/${encodeURIComponent((body && body.instance) || cfg.instance)}`;
  }

  if (pathname === '/instance/fetchInstances') {
    const response = await fetchWithTimeout(cfg.url + pathname, { headers: { apikey: cfg.key } });
    const data = await readJsonResponse(response);
    if (!response.ok) return { ok: false, configured: true, status: 'error', error: data.message || `HTTP ${response.status}` };
    const list = Array.isArray(data) ? data : [];
    const found = list.find(item =>
      item.name === cfg.instance ||
      item.instanceName === cfg.instance ||
      item.id === cfg.instance ||
      (item.instance && item.instance.instanceName === cfg.instance)
    );
    const status = found && (found.connectionStatus || found.status || found.state || (found.instance && found.instance.state)) || 'not_found';
    return { ok: true, success: true, configured: true, connected: status === 'open', status, instance: cfg.instance, data: found || null };
  }

  if (pathname === '/instance/connect' && method === 'POST') {
    const instance = (body && body.instance) || cfg.instance;
    const createPayload = { instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' };
    const attempts = [];

    try {
      attempts.push({ route: '/instance/create', ...(await evolutionHttp(cfg, '/instance/create', 'POST', createPayload)) });
    } catch (error) {
      attempts.push({ route: '/instance/create', error: error.message });
    }

    const connectPaths = [
      { route: `/instance/connect/${encodeURIComponent(instance)}`, method: 'GET' },
      { route: `/instance/connect/${encodeURIComponent(instance)}`, method: 'POST' },
      { route: `/instance/qrcode/${encodeURIComponent(instance)}?image=true`, method: 'GET' },
      { route: `/instance/qrcode/${encodeURIComponent(instance)}`, method: 'GET' }
    ];

    for (const attempt of attempts) {
      const qr = normalizeQrDataUrl(attempt.data);
      if (attempt.response && attempt.response.ok && qr) {
        return { ok: true, success: true, configured: true, status: 'qrcode', instance, qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(attempt.data), route: attempt.route, raw: attempt.data, data: attempt.data };
      }
    }

    for (const item of connectPaths) {
      try {
        const out = await evolutionHttp(cfg, item.route, item.method, { instanceName: instance, instance });
        const qr = normalizeQrDataUrl(out.data);
        const pairingCode = extractPairingCode(out.data);
        attempts.push({ route: item.route, method: item.method, status: out.response.status, ok: out.response.ok, data: out.data });
        if (out.response.ok && qr) {
          return { ok: true, success: true, configured: true, status: 'qrcode', instance, qrCode: qr, qrcode: qr, qr, pairing_code: pairingCode, route: item.route, raw: out.data, data: out.data };
        }
        if (out.response.ok && pairingCode) {
          return { ok: true, success: true, configured: true, status: 'pairing_code', instance, pairing_code: pairingCode, route: item.route, raw: out.data, data: out.data, message: 'A Evolution retornou codigo de pareamento, nao QR Code.' };
        }
      } catch (error) {
        attempts.push({ route: item.route, method: item.method, error: error.message });
      }
    }

    return {
      ok: true,
      success: false,
      configured: true,
      status: 'qrcode_not_returned',
      qrcode: null,
      qrCode: null,
      qr: null,
      instance,
      message: 'Evolution API respondeu, mas nao retornou QR Code. Verifique se a instancia ja esta conectada, se o nome da instancia esta correto ou consulte os detalhes no log.',
      attempts: attempts.map(attempt => ({
        route: attempt.route,
        method: attempt.method,
        status: attempt.status || (attempt.response && attempt.response.status) || null,
        ok: attempt.ok || (attempt.response && attempt.response.ok) || false,
        error: attempt.error || null
      }))
    };
  }

  const { response, data } = await evolutionHttp(cfg, path, method, body);
  if (!response.ok) return { ok: false, success: false, configured: true, status: 'error', error: data.message || data.error || `HTTP ${response.status}`, raw: data };
  const qr = normalizeQrDataUrl(data);
  return { ok: true, success: true, configured: true, status: qr ? 'qrcode' : 'ok', qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(data), raw: data, data };
}

async function metaRequest(pathname) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: true, configured: false, data: null, message: 'META_ACCESS_TOKEN nao configurado.' };
  const separator = pathname.includes('?') ? '&' : '?';
  const version = String(process.env.META_GRAPH_VERSION || 'v20.0').replace(/^\/+/, '');
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

module.exports = { integrationStatus, openAIChat, evolutionConfig, normalizeEvolutionConfig, evolutionRequest, metaRequest, googleStatus };

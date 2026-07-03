const QRCode = require('qrcode');
const { cleanUrl } = require('./http');

function normalizeInstanceName(value) {
  const normalized = String(value || 'r2r-crm')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || 'r2r-crm';
}

function statusIsConnected(status) {
  return ['open', 'connected'].includes(String(status || '').toLowerCase());
}

function possibleInstanceNames(item = {}) {
  return [
    item.name,
    item.instanceName,
    item.id,
    item.instance && item.instance.instanceName,
    item.instance && item.instance.name,
    item.instance && item.instance.id
  ].filter(Boolean).map(value => String(value).toLowerCase());
}

function connectionStatus(item = {}) {
  return item.connectionStatus ||
    item.status ||
    item.state ||
    item.instance && (item.instance.connectionStatus || item.instance.status || item.instance.state) ||
    'not_found';
}

function instanceList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.response)) return data.response;
  if (data && Array.isArray(data.instances)) return data.instances;
  return [];
}

function integrationStatus() {
  return {
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },
    evolution: {
      configured: !!((process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL) && process.env.EVOLUTION_API_KEY),
      instance: normalizeInstanceName(process.env.EVOLUTION_INSTANCE || 'r2r-crm')
    },
    meta: {
      configured: !!process.env.META_ACCESS_TOKEN,
      ad_account_configured: !!process.env.META_AD_ACCOUNT_ID
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

  const priority = ['base64', 'base64Image', 'qrcode', 'qrCode', 'qr', 'image'];
  for (const key of priority) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = extractQr(value[key], seen);
      if (found) return found;
      if (typeof value[key] === 'string' && key.toLowerCase().includes('qr')) {
        const text = value[key].trim();
        if (text.startsWith('data:image/') || /^(iVBOR|\/9j\/|R0lGOD|PHN2Z)/.test(text)) return text;
      }
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

function looksLikeQrPayload(value) {
  const text = String(value || '').trim();
  if (text.length < 32) return false;
  if (text.startsWith('data:image/')) return false;
  if (/^(iVBOR|\/9j\/|R0lGOD|PHN2Z)/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  return true;
}

function extractQrPayload(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === 'string') return looksLikeQrPayload(value) ? value.trim() : null;
  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (['code', 'qrcode', 'qrcodestring', 'qrstring', 'qrtext'].includes(normalized) && typeof item === 'string') {
      const payload = extractQrPayload(item, seen);
      if (payload) return payload;
    }
  }

  for (const item of Object.values(value)) {
    const payload = extractQrPayload(item, seen);
    if (payload) return payload;
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

async function normalizeQrDataUrl(value) {
  const qr = extractQr(value);
  if (qr) {
    if (String(qr).startsWith('data:image/')) return qr;
    return `data:image/png;base64,${qr}`;
  }

  const payload = extractQrPayload(value);
  if (!payload) return null;
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260
  });
}

async function evolutionHttp(cfg, pathname, method = 'GET', body) {
  const response = await fetch(cfg.url + pathname, {
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

  const messages = [
    { role: 'system', content: systemPrompt },
    ...Array.isArray(history) ? history.slice(-12) : [],
    { role: 'user', content: String(message || '') }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
    instance: normalizeInstanceName(process.env.EVOLUTION_INSTANCE || 'r2r-crm')
  };
}

function normalizeEvolutionConfig(config = {}) {
  return {
    url: cleanUrl(config.url || config.evolution_url || ''),
    key: config.key || config.apiKey || config.api_key || config.apikey || '',
    instance: normalizeInstanceName(config.instance || config.inst || config.instanceName || 'r2r-crm')
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
    const response = await fetch(cfg.url + pathname, { headers: { apikey: cfg.key } });
    const data = await readJsonResponse(response);
    if (!response.ok) return { ok: false, configured: true, status: 'error', error: data.message || `HTTP ${response.status}` };
    const list = instanceList(data);
    const wanted = String(cfg.instance).toLowerCase();
    const found = list.find(item =>
      possibleInstanceNames(item).includes(wanted)
    );
    const status = found ? connectionStatus(found) : 'not_found';
    return { ok: true, success: true, configured: true, connected: statusIsConnected(status), status, instance: cfg.instance, data: found || null };
  }

  if (pathname === '/instance/connect' && method === 'POST') {
    const instance = normalizeInstanceName((body && body.instance) || cfg.instance);
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
      const qr = await normalizeQrDataUrl(attempt.data);
      if (attempt.response && attempt.response.ok && qr) {
        return { ok: true, success: true, configured: true, status: 'qrcode', instance, qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(attempt.data), route: attempt.route, raw: attempt.data, data: attempt.data };
      }
    }

    for (const item of connectPaths) {
      try {
        const out = await evolutionHttp(cfg, item.route, item.method, { instanceName: instance, instance });
        const qr = await normalizeQrDataUrl(out.data);
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
  const qr = await normalizeQrDataUrl(data);
  return { ok: true, success: true, configured: true, status: qr ? 'qrcode' : 'ok', qrCode: qr, qrcode: qr, qr, pairing_code: extractPairingCode(data), raw: data, data };
}

async function metaRequest(pathname) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: true, configured: false, data: null, message: 'META_ACCESS_TOKEN nao configurado.' };
  const separator = pathname.includes('?') ? '&' : '?';
  const response = await fetch(`https://graph.facebook.com/v20.0${pathname}${separator}access_token=${encodeURIComponent(token)}`);
  const data = await readJsonResponse(response);
  if (!response.ok) return { ok: false, configured: true, error: data.error && data.error.message || `HTTP ${response.status}`, raw: data };
  return { ok: true, configured: true, data: data.data || data };
}

module.exports = { integrationStatus, openAIChat, evolutionConfig, normalizeEvolutionConfig, normalizeInstanceName, evolutionRequest, metaRequest };

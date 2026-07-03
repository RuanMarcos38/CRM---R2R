const crypto = require('crypto');
const { listEnv, numberEnv } = require('./env');

const buckets = new Map();

function corsHeaders(reqOrigin) {
  const raw = listEnv('CORS_ORIGIN', ['*']);
  const allowAll = raw.includes('*');
  const origin = allowAll ? '*' : (reqOrigin && raw.includes(reqOrigin) ? reqOrigin : raw[0]);
  const headers = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey,x-api-key',
    'Access-Control-Max-Age': '86400'
  };
  if (origin && origin !== '*') headers.Vary = 'Origin';
  return headers;
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function checkRateLimit(req) {
  const max = numberEnv('RATE_LIMIT_MAX', 240);
  const windowMs = numberEnv('RATE_LIMIT_WINDOW_MS', 60_000);
  if (!max || max < 1) return true;

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `${ip}:${Math.floor(Date.now() / windowMs)}`;
  const used = (buckets.get(key) || 0) + 1;
  buckets.set(key, used);

  if (buckets.size > 5000) {
    const currentWindow = Math.floor(Date.now() / windowMs);
    for (const item of buckets.keys()) {
      if (!item.endsWith(`:${currentWindow}`)) buckets.delete(item);
    }
  }

  return used <= max;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomToken(prefix = 'r2r') {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

function stripSensitiveFields(input) {
  if (Array.isArray(input)) return input.map(stripSensitiveFields);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const blocked = ['token', 'access_token', 'api_key', 'apikey', 'secret', 'password', 'service_role', 'key'];
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const lowered = key.toLowerCase();
    if (blocked.some(term => lowered.includes(term))) {
      out[key] = value ? '[redacted]' : value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = stripSensitiveFields(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function sanitizePayload(payload, options = {}) {
  const out = {};
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const blocked = new Set(['id', 'created_at', 'updated_at']);
  if (options.blockCompanyId) blocked.add('empresa_id');

  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key)) continue;
    if (typeof value === 'string') out[key] = value.trim();
    else out[key] = value;
  }
  return options.allowSensitive ? out : stripSensitiveFields(out);
}

module.exports = { corsHeaders, securityHeaders, checkRateLimit, sha256, randomToken, sanitizePayload, stripSensitiveFields };

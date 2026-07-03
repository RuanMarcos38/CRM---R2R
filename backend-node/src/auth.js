const crypto = require('crypto');
const { cleanUrl } = require('./http');
const { boolEnv } = require('./env');
const { sha256 } = require('./security');

const DEFAULT_EMPRESA_ID = '00000000-0000-4000-8000-000000000001';

function authError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function parseDurationSeconds(value, fallback = 60 * 60 * 24 * 7) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return Math.max(60, Number(raw));
  const match = raw.match(/^(\d+)\s*([smhd])$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] || 1;
  return Math.max(60, amount * multiplier);
}

function localSessionTtlSeconds() {
  return parseDurationSeconds(process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_SECONDS, 60 * 60 * 24 * 7);
}

function localTokenSecret() {
  return process.env.JWT_SECRET ||
    process.env.R2R_ADMIN_PASSWORD_SHA256 ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    'r2r-crm-local-development-secret';
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signLocalPayload(encodedPayload) {
  return crypto.createHmac('sha256', localTokenSecret()).update(encodedPayload).digest('base64url');
}

function createLocalSessionToken(authUser = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'r2r-crm-saas',
    aud: 'authenticated',
    sub: String(authUser.id || 'env-admin'),
    email: String(authUser.email || '').toLowerCase(),
    local_admin: !!authUser.local_admin,
    iat: now,
    exp: now + localSessionTtlSeconds()
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `r2r.${encodedPayload}.${signLocalPayload(encodedPayload)}`;
}

function verifyLocalSessionToken(token) {
  if (!token || !token.startsWith('r2r.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = signLocalPayload(parts[1]);
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }

  if (!payload || !payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return {
    id: payload.sub,
    email: payload.email || null,
    aud: payload.aud || 'authenticated',
    local: true,
    local_admin: !!payload.local_admin
  };
}

function localAdminProfile(authUser = {}) {
  return {
    id: 'env-admin-profile',
    empresa_id: process.env.R2R_EMPRESA_ID || DEFAULT_EMPRESA_ID,
    auth_user_id: authUser.id || 'env-admin',
    nome: process.env.R2R_ADMIN_NAME || 'Administrador R2R',
    email: authUser.email || process.env.R2R_ADMIN_EMAIL || 'admin@r2r.local',
    funcao: 'Administrador',
    tipo_usuario: 'super_admin',
    status: 'ativo',
    permissoes: { all: true },
    origem: 'env'
  };
}

async function verifyWithSupabase(token) {
  const url = cleanUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) return null;

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}

function permissionsFromProfile(profile) {
  const tipo = String(profile && (profile.tipo_usuario || profile.tipo) || 'usuario').toLowerCase();
  const admin = ['super_admin', 'admin', 'administrador'].includes(tipo);
  return {
    tipo,
    admin,
    super_admin: tipo === 'super_admin',
    gestor: tipo === 'gestor',
    financeiro: tipo === 'financeiro' || admin,
    can_write: tipo !== 'visualizador' && tipo !== 'limitado',
    custom: profile && profile.permissoes || {}
  };
}

async function resolveAuthContext(req, store) {
  const token = bearerToken(req);
  let authUser = null;

  if (token && token.startsWith('r2r.')) {
    authUser = verifyLocalSessionToken(token);
  }

  if (!authUser && token) {
    authUser = await verifyWithSupabase(token);
  }

  if (!authUser && boolEnv('ALLOW_DEMO_AUTH', store.kind === 'local' && process.env.NODE_ENV !== 'production')) {
    authUser = {
      id: 'demo-auth-user',
      email: process.env.DEMO_USER_EMAIL || 'admin@demo.local',
      aud: 'authenticated'
    };
  }

  if (!authUser) throw authError('Sessao invalida ou expirada.', 401);

  const profile = await store.findProfileByAuthUser(authUser).catch(() => null) ||
    (authUser.local_admin ? localAdminProfile(authUser) : null);
  if (!profile) {
    throw authError('Usuario autenticado, mas sem perfil em public.usuarios. Crie o usuario e vincule auth_user_id ou email.', 403);
  }

  if (!['ativo', 'Ativo', 'active'].includes(String(profile.status || 'ativo'))) {
    throw authError('Usuario inativo ou bloqueado.', 403);
  }

  return {
    user: { id: authUser.id, email: authUser.email },
    profile,
    empresaId: profile.empresa_id,
    permissions: permissionsFromProfile(profile)
  };
}

async function requireAuth(req, store) {
  return resolveAuthContext(req, store);
}

async function verifyApiKey(req, store) {
  const raw = req.headers['x-api-key'] || req.headers.apikey || '';
  if (!raw) return null;
  const row = await store.findApiKey(sha256(raw));
  if (!row) return null;
  return {
    system: false,
    apiKey: row,
    empresaId: row.empresa_id,
    profile: null,
    user: { id: 'api-key', email: null },
    permissions: { tipo: 'api_key', admin: false, super_admin: false, can_write: true, custom: row.permissoes || {} }
  };
}

module.exports = {
  resolveAuthContext,
  requireAuth,
  verifyApiKey,
  permissionsFromProfile,
  bearerToken,
  createLocalSessionToken,
  localSessionTtlSeconds,
  localAdminProfile
};

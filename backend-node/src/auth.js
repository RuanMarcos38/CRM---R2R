const { cleanUrl } = require('./http');
const { boolEnv } = require('./env');
const { sha256 } = require('./security');

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

async function verifyWithSupabase(token) {
  const url = cleanUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
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

  if (token) {
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

  const profile = await store.findProfileByAuthUser(authUser);
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

module.exports = { resolveAuthContext, requireAuth, verifyApiKey, permissionsFromProfile, bearerToken };

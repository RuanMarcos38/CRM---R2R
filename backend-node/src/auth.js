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
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return response.json();
}

function permissionsFromProfile(profile) {
  const tipo = normalizeRole(profile && (profile.tipo_usuario || profile.tipo) || 'usuario');
  const companyAdmin = ['company_admin', 'admin', 'administrador'].includes(tipo);
  const manager = tipo === 'manager' || tipo === 'gestor';
  const sales = ['atendente', 'comercial', 'vendedor', 'financeiro'].includes(tipo);
  return {
    tipo,
    role: tipo,
    admin: tipo === 'super_admin' || companyAdmin,
    company_admin: companyAdmin,
    super_admin: tipo === 'super_admin',
    manager,
    gestor: manager,
    atendente: tipo === 'atendente',
    comercial: tipo === 'comercial' || tipo === 'vendedor',
    financeiro: tipo === 'financeiro' || companyAdmin || tipo === 'super_admin',
    sales,
    can_write: !['visualizador', 'limitado', 'viewer'].includes(tipo),
    custom: profile && profile.permissoes || {}
  };
}

function normalizeRole(value) {
  const tipo = String(value || 'usuario')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return ({
    administrador_da_empresa: 'company_admin',
    administrador: 'administrador',
    admin_empresa: 'company_admin',
    empresa_admin: 'company_admin',
    usuario_comum: 'usuario',
    usuario: 'usuario',
    gestor: 'manager',
    gerente: 'manager',
    visualizador: 'visualizador'
  })[tipo] || tipo;
}

function autoLinkAuthProfileAllowed() {
  return boolEnv('AUTO_LINK_AUTH_PROFILE', true) || boolEnv('ALLOW_EMAIL_PROFILE_LINK', false);
}

async function findAndLinkProfileByEmail(authUser, store) {
  const email = authUser && authUser.email ? String(authUser.email).trim().toLowerCase() : '';
  const authUserId = authUser && authUser.id ? String(authUser.id).trim() : '';
  if (!email || !authUserId || !autoLinkAuthProfileAllowed()) return null;
  if (!store || store.kind !== 'supabase' || typeof store.request !== 'function') return null;

  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('email', `eq.${email}`);
  params.set('limit', '2');

  const rows = await store.request(`/usuarios?${params.toString()}`).catch(() => []);
  if (!Array.isArray(rows) || rows.length !== 1) return null;

  const profile = rows[0];
  if (profile.auth_user_id && profile.auth_user_id !== authUserId) return null;
  if (profile.auth_user_id === authUserId) return profile;

  const updateParams = new URLSearchParams();
  updateParams.set('id', `eq.${profile.id}`);
  const updated = await store.request(`/usuarios?${updateParams.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ auth_user_id: authUserId })
  }).catch(() => null);

  return Array.isArray(updated) && updated.length === 1 ? updated[0] : profile;
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

  let profile = await store.findProfileByAuthUser(authUser);
  if (!profile) profile = await findAndLinkProfileByEmail(authUser, store);
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

module.exports = { resolveAuthContext, requireAuth, verifyApiKey, permissionsFromProfile, bearerToken, findAndLinkProfileByEmail };

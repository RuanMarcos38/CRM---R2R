'use strict';

const { cleanUrl } = require('./http');
const { boolEnv } = require('./env');
const { sha256 } = require('./security');

function authError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function bearerToken(req) {
  const header = String(
    req &&
    req.headers &&
    req.headers.authorization
      ? req.headers.authorization
      : ''
  ).trim();

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match && match[1]
    ? match[1].trim()
    : '';
}

function validSupabaseKey(key) {
  const value = String(key || '').trim();

  if (!value) return false;

  if (
    value.includes('COLE_') ||
    value.includes('SUA_CHAVE') ||
    value.includes('CHAVE_PUBLICA_REAL')
  ) {
    return false;
  }

  return (
    value.startsWith('sb_publishable_') ||
    value.startsWith('eyJ')
  );
}

async function verifyWithSupabase(token) {
  const url = cleanUrl(
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    ''
  );

  const key = String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url) {
    console.error('[AUTH] SUPABASE_URL não configurada.');
    return null;
  }

  if (!validSupabaseKey(key)) {
    console.error(
      '[AUTH] SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY inválida.'
    );
    return null;
  }

  if (!token) {
    console.error('[AUTH] Token Bearer ausente.');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('[AUTH] Supabase recusou a sessão.', {
        status: response.status,
        body: responseText.slice(0, 500)
      });

      return null;
    }

    if (!responseText) {
      console.error('[AUTH] Supabase retornou resposta vazia.');
      return null;
    }

    let authUser;

    try {
      authUser = JSON.parse(responseText);
    } catch (error) {
      console.error('[AUTH] Resposta inválida do Supabase.', {
        message: error.message,
        body: responseText.slice(0, 500)
      });

      return null;
    }

    if (!authUser || !authUser.id) {
      console.error('[AUTH] Usuário retornado sem ID.');
      return null;
    }

    return authUser;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      console.error('[AUTH] Timeout ao validar sessão no Supabase.');
    } else {
      console.error('[AUTH] Falha ao validar sessão no Supabase.', {
        message: error && error.message
          ? error.message
          : String(error)
      });
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRole(value) {
  const tipo = String(value || 'usuario')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  const aliases = {
    super_admin: 'super_admin',
    superadmin: 'super_admin',
    administrador_da_empresa: 'company_admin',
    administrador_empresa: 'company_admin',
    admin_empresa: 'company_admin',
    empresa_admin: 'company_admin',
    company_admin: 'company_admin',
    administrador: 'administrador',
    admin: 'administrador',
    usuario_comum: 'usuario',
    usuario: 'usuario',
    gestor: 'manager',
    gerente: 'manager',
    manager: 'manager',
    vendedor: 'vendedor',
    comercial: 'comercial',
    atendente: 'atendente',
    financeiro: 'financeiro',
    visualizador: 'visualizador',
    viewer: 'visualizador',
    limitado: 'limitado'
  };

  return aliases[tipo] || tipo;
}

function permissionsFromProfile(profile) {
  const tipo = normalizeRole(
    profile &&
    (profile.tipo_usuario || profile.tipo || profile.role)
      ? profile.tipo_usuario || profile.tipo || profile.role
      : 'usuario'
  );

  const companyAdmin = [
    'company_admin',
    'administrador',
    'admin'
  ].includes(tipo);

  const manager = [
    'manager',
    'gestor'
  ].includes(tipo);

  const sales = [
    'atendente',
    'comercial',
    'vendedor',
    'financeiro'
  ].includes(tipo);

  return {
    tipo,
    role: tipo,

    admin:
      tipo === 'super_admin' ||
      companyAdmin,

    company_admin: companyAdmin,
    super_admin: tipo === 'super_admin',

    manager,
    gestor: manager,

    atendente: tipo === 'atendente',

    comercial:
      tipo === 'comercial' ||
      tipo === 'vendedor',

    financeiro:
      tipo === 'financeiro' ||
      companyAdmin ||
      tipo === 'super_admin',

    sales,

    can_write: ![
      'visualizador',
      'limitado',
      'viewer'
    ].includes(tipo),

    custom:
      profile &&
      profile.permissoes &&
      typeof profile.permissoes === 'object'
        ? profile.permissoes
        : {}
  };
}

function profileIsActive(profile) {
  const status = String(
    profile && profile.status
      ? profile.status
      : 'ativo'
  )
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return [
    'ativo',
    'active',
    'enabled',
    'habilitado'
  ].includes(status);
}

async function resolveAuthContext(req, store) {
  if (!store) {
    throw authError(
      'Armazenamento não disponível para autenticação.',
      500
    );
  }

  const token = bearerToken(req);
  let authUser = null;

  if (token) {
    authUser = await verifyWithSupabase(token);
  }

  const allowDemoAuth = boolEnv(
    'ALLOW_DEMO_AUTH',
    store.kind === 'local' &&
    process.env.NODE_ENV !== 'production'
  );

  if (!authUser && allowDemoAuth) {
    authUser = {
      id: 'demo-auth-user',
      email:
        process.env.DEMO_USER_EMAIL ||
        'admin@demo.local',
      aud: 'authenticated'
    };
  }

  if (!authUser) {
    throw authError(
      'Sessão inválida ou expirada.',
      401
    );
  }

  if (typeof store.findProfileByAuthUser !== 'function') {
    throw authError(
      'Método de consulta do perfil não está disponível.',
      500
    );
  }

  const profile = await store.findProfileByAuthUser(authUser);

  if (!profile) {
    throw authError(
      'Usuário autenticado, mas sem perfil em public.usuarios. Crie o usuário e vincule auth_user_id ou e-mail.',
      403
    );
  }

  if (!profileIsActive(profile)) {
    throw authError(
      'Usuário inativo ou bloqueado.',
      403
    );
  }

  const permissions = permissionsFromProfile(profile);

  const empresaId =
    profile.empresa_id ||
    profile.empresaId ||
    null;

  if (!permissions.super_admin && !empresaId) {
    throw authError(
      'Usuário sem empresa vinculada. Vincule o usuário a uma empresa antes de acessar o CRM.',
      403
    );
  }

  return {
    system: false,

    user: {
      id: authUser.id,
      email: authUser.email || null
    },

    profile,
    empresaId,
    permissions
  };
}

async function requireAuth(req, store) {
  return resolveAuthContext(req, store);
}

async function verifyApiKey(req, store) {
  if (
    !req ||
    !req.headers ||
    !store ||
    typeof store.findApiKey !== 'function'
  ) {
    return null;
  }

  const raw = String(
    req.headers['x-api-key'] ||
    req.headers.apikey ||
    ''
  ).trim();

  if (!raw) return null;

  if (
    raw.startsWith('eyJ') ||
    raw.startsWith('sb_publishable_')
  ) {
    return null;
  }

  const row = await store.findApiKey(
    sha256(raw)
  );

  if (!row || !row.empresa_id) {
    return null;
  }

  return {
    system: false,
    apiKey: row,
    empresaId: row.empresa_id,
    profile: null,

    user: {
      id: 'api-key',
      email: null
    },

    permissions: {
      tipo: 'api_key',
      role: 'api_key',
      admin: false,
      company_admin: false,
      super_admin: false,
      manager: false,
      gestor: false,
      atendente: false,
      comercial: false,
      financeiro: false,
      sales: false,
      can_write: true,

      custom:
        row.permissoes &&
        typeof row.permissoes === 'object'
          ? row.permissoes
          : {}
    }
  };
}

module.exports = {
  resolveAuthContext,
  requireAuth,
  verifyApiKey,
  permissionsFromProfile,
  bearerToken,
  verifyWithSupabase,
  normalizeRole
};
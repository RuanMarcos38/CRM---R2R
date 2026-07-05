const { boolEnv } = require('./env');

const FEATURE_BY_TABLE = {
  campanhas: 'meta_ads',
  integracoes: 'integrations',
  automacoes: 'automation',
  automacao_regras: 'automation',
  api_keys: 'webhooks',
  ia_agentes: 'ai'
};

const FEATURE_BY_PATH = [
  [/^\/api\/meta\//, 'meta_ads'],
  [/^\/api\/whatsapp\//, 'whatsapp'],
  [/^\/api\/integrations\/evolution/, 'whatsapp'],
  [/^\/api\/integrations\/whatsapp/, 'whatsapp'],
  [/^\/api\/ai\//, 'ai'],
  [/^\/api\/n8n\//, 'n8n'],
  [/^\/api\/billing\//, 'billing'],
  [/^\/api\/webhooks\//, 'webhooks']
];

const CRM_WRITE_TABLES = new Set([
  'leads',
  'clientes',
  'oportunidades',
  'atividades',
  'tarefas',
  'conversas',
  'mensagens',
  'campanhas',
  'fontes_lead',
  'arquivos',
  'tags',
  'lead_tags',
  'notificacoes'
]);

const ADMIN_TABLES = new Set([
  'usuarios',
  'assinaturas',
  'configuracoes',
  'integracoes',
  'automacoes',
  'automacao_regras',
  'webhooks_logs',
  'audit_logs',
  'api_keys',
  'permissoes',
  'ia_agentes',
  'campos_personalizados',
  'feature_flags'
]);

function forbidden(message = 'Permissao insuficiente.') {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function normalizeAction(method) {
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET') return 'read';
  if (verb === 'POST') return 'create';
  if (verb === 'PUT' || verb === 'PATCH') return 'update';
  if (verb === 'DELETE') return 'delete';
  return 'execute';
}

function isCompanyAdmin(ctx) {
  return !!(ctx && ctx.permissions && (ctx.permissions.super_admin || ctx.permissions.company_admin || ctx.permissions.admin));
}

function isManager(ctx) {
  return !!(ctx && ctx.permissions && ctx.permissions.manager);
}

function canUseCustomPermission(ctx, moduleName, action) {
  const custom = ctx && ctx.permissions && ctx.permissions.custom || {};
  const direct = custom[moduleName] || custom[String(moduleName || '').replace(/-/g, '_')];
  if (direct === true) return true;
  if (Array.isArray(direct)) return direct.includes(action) || direct.includes('*');
  if (direct && typeof direct === 'object') return direct[action] === true || direct['*'] === true;
  return false;
}

function assertResourceAccess(ctx, resource, method) {
  const action = normalizeAction(method);
  const table = resource && resource.table || '';
  const permissions = ctx && ctx.permissions || {};

  if (permissions.super_admin) return true;

  if (resource && resource.superAdminOnly) {
    throw forbidden('Somente Super Admin pode acessar este recurso.');
  }

  if (resource && resource.adminOnly || ADMIN_TABLES.has(table)) {
    if (!isCompanyAdmin(ctx)) throw forbidden('Somente Administrador da Empresa pode acessar este recurso.');
    return true;
  }

  if (action === 'read') return true;

  if (action === 'delete' && !isCompanyAdmin(ctx)) {
    throw forbidden('Somente administrador pode excluir registros.');
  }

  if (!permissions.can_write) {
    throw forbidden('Perfil sem permissao de escrita.');
  }

  if (isCompanyAdmin(ctx)) return true;
  if (isManager(ctx) && CRM_WRITE_TABLES.has(table) && action !== 'delete') return true;
  if (CRM_WRITE_TABLES.has(table) && ['create', 'update'].includes(action)) return true;

  if (canUseCustomPermission(ctx, table, action)) return true;
  throw forbidden('Perfil sem permissao para esta acao.');
}

function featureForPath(pathname, resource) {
  if (resource && resource.feature) return resource.feature;
  if (resource && FEATURE_BY_TABLE[resource.table]) return FEATURE_BY_TABLE[resource.table];
  const path = String(pathname || '');
  const found = FEATURE_BY_PATH.find(([regex]) => regex.test(path));
  return found ? found[1] : '';
}

function normalizeFeatureName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function featureMap(store, ctx) {
  if (!ctx || !ctx.empresaId) return {};
  const rows = await store.list('feature_flags', { limit: 500 }, ctx, {
    table: 'feature_flags',
    companyScoped: true,
    defaultOrder: 'feature_name.asc'
  }).catch(() => []);
  const out = {};
  for (const row of rows || []) {
    const name = normalizeFeatureName(row.feature_name || row.nome || row.name);
    if (name) out[name] = row.enabled !== false && row.ativo !== false;
  }
  return out;
}

async function assertFeatureEnabled(store, ctx, featureName) {
  const feature = normalizeFeatureName(featureName);
  if (!feature || (ctx && ctx.permissions && ctx.permissions.super_admin)) return true;
  const flags = await featureMap(store, ctx);
  if (Object.prototype.hasOwnProperty.call(flags, feature) && flags[feature] === false) {
    throw forbidden(`Funcionalidade "${feature}" desativada para esta empresa.`);
  }
  return true;
}

function apiKeyAllows(ctx, moduleName, action) {
  if (!ctx || !(ctx.permissions && ctx.permissions.tipo === 'api_key')) return true;
  return canUseCustomPermission(ctx, moduleName, action);
}

function globalIntegrationFallbackAllowed(ctx) {
  return boolEnv('ALLOW_GLOBAL_INTEGRATION_FALLBACK', process.env.NODE_ENV !== 'production')
    || !!(ctx && ctx.permissions && ctx.permissions.super_admin);
}

module.exports = {
  assertFeatureEnabled,
  assertResourceAccess,
  apiKeyAllows,
  featureForPath,
  featureMap,
  forbidden,
  globalIntegrationFallbackAllowed,
  isCompanyAdmin,
  normalizeAction,
  normalizeFeatureName
};

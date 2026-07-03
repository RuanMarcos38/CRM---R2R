const RESOURCES = {
  empresas: { table: 'empresas', path: '/api/empresas', companyScoped: false, adminOnly: true },
  usuarios: { table: 'usuarios', path: '/api/usuarios', companyScoped: true, adminOnly: true },
  planos: { table: 'planos', path: '/api/planos', companyScoped: false },
  assinaturas: { table: 'assinaturas', path: '/api/assinaturas', companyScoped: true, adminOnly: true },
  leads: { table: 'leads', path: '/api/leads', companyScoped: true, search: ['nome', 'email', 'telefone', 'empresa', 'origem_nome', 'campanha'], defaultOrder: 'created_at.desc' },
  clientes: { table: 'clientes', path: '/api/clientes', companyScoped: true, search: ['nome', 'email', 'telefone', 'empresa', 'nicho'], defaultOrder: 'created_at.desc' },
  contatos: { table: 'clientes', path: '/api/contatos', companyScoped: true, search: ['nome', 'email', 'telefone', 'empresa', 'nicho'], defaultOrder: 'created_at.desc' },
  contacts: { table: 'clientes', path: '/api/contacts', companyScoped: true, search: ['nome', 'email', 'telefone', 'empresa', 'nicho'], defaultOrder: 'created_at.desc' },
  oportunidades: { table: 'oportunidades', path: '/api/oportunidades', companyScoped: true, search: ['servico_interesse', 'status', 'fonte', 'campanha'], defaultOrder: 'created_at.desc' },
  funis: { table: 'funis', path: '/api/funis', companyScoped: true, defaultOrder: 'ordem.asc' },
  funil_etapas: { table: 'funil_etapas', path: '/api/funil-etapas', companyScoped: true, defaultOrder: 'ordem.asc' },
  atividades: { table: 'atividades', path: '/api/atividades', companyScoped: true, defaultOrder: 'created_at.desc' },
  lead_historico: { table: 'atividades', path: '/api/lead-historico', companyScoped: true, defaultOrder: 'created_at.desc' },
  tarefas: { table: 'tarefas', path: '/api/tarefas', companyScoped: true, search: ['titulo', 'descricao', 'status', 'prioridade'], defaultOrder: 'prazo.asc' },
  conversas: { table: 'conversas', path: '/api/conversas', companyScoped: true, search: ['canal', 'wa_contact_id', 'ultima_mensagem', 'status'], defaultOrder: 'updated_at.desc' },
  mensagens: { table: 'mensagens', path: '/api/mensagens', companyScoped: true, defaultOrder: 'created_at.asc' },
  messages: { table: 'mensagens', path: '/api/messages', companyScoped: true, defaultOrder: 'created_at.asc' },
  campanhas: { table: 'campanhas', path: '/api/campanhas', companyScoped: true, search: ['nome', 'canal', 'objetivo', 'status'], defaultOrder: 'created_at.desc' },
  fontes_lead: { table: 'fontes_lead', path: '/api/fontes-lead', companyScoped: true, defaultOrder: 'nome.asc' },
  configuracoes: { table: 'configuracoes', path: '/api/configuracoes', companyScoped: true, adminOnly: true },
  integracoes: { table: 'integracoes', path: '/api/integracoes', companyScoped: true, adminOnly: true },
  integrations: { table: 'integracoes', path: '/api/integrations', companyScoped: true, adminOnly: true },
  automacoes: { table: 'automacoes', path: '/api/automacoes', companyScoped: true, adminOnly: true },
  automacao_regras: { table: 'automacao_regras', path: '/api/automacao-regras', companyScoped: true, adminOnly: true },
  arquivos: { table: 'arquivos', path: '/api/arquivos', companyScoped: true },
  tags: { table: 'tags', path: '/api/tags', companyScoped: true, defaultOrder: 'nome.asc' },
  lead_tags: { table: 'lead_tags', path: '/api/lead-tags', companyScoped: true },
  notificacoes: { table: 'notificacoes', path: '/api/notificacoes', companyScoped: true, defaultOrder: 'created_at.desc' },
  webhooks_logs: { table: 'webhooks_logs', path: '/api/webhooks-logs', companyScoped: true, adminOnly: true, defaultOrder: 'created_at.desc' },
  billing_webhooks: { table: 'billing_webhooks', path: '/api/billing-webhooks', companyScoped: false, adminOnly: true, defaultOrder: 'created_at.desc' },
  audit_logs: { table: 'audit_logs', path: '/api/audit-logs', companyScoped: true, adminOnly: true, defaultOrder: 'created_at.desc' },
  api_keys: { table: 'api_keys', path: '/api/api-keys', companyScoped: true, adminOnly: true, defaultOrder: 'created_at.desc' },
  permissoes: { table: 'permissoes', path: '/api/permissoes', companyScoped: true, adminOnly: true },
  ia_agentes: { table: 'ia_agentes', path: '/api/ia-agentes', companyScoped: true, adminOnly: true },
  templates_nicho: { table: 'templates_nicho', path: '/api/templates-nicho', companyScoped: false },
  campos_personalizados: { table: 'campos_personalizados', path: '/api/campos-personalizados', companyScoped: true, adminOnly: true }
};

const PATHS = Object.values(RESOURCES).reduce((acc, resource) => {
  acc[resource.path] = resource;
  return acc;
}, {});

function resourceForPath(pathname) {
  const clean = pathname.replace(/\/+$/, '');
  if (PATHS[clean]) return { ...PATHS[clean] };
  for (const resource of Object.values(RESOURCES)) {
    const prefix = resource.path + '/';
    if (clean.startsWith(prefix)) {
      const id = decodeURIComponent(clean.slice(prefix.length));
      if (!id || id.includes('/')) return null;
      return { ...resource, id };
    }
  }
  return null;
}

module.exports = { RESOURCES, resourceForPath };

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function groupCount(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'Nao informado';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

async function buildReportsSummary(store, ctx, query = {}) {
  const [leads, oportunidades, tarefas, conversas, campanhas, usuarios, assinaturas] = await Promise.all([
    store.list('leads', { limit: 500, order: 'created_at.desc' }, ctx, { companyScoped: true }),
    store.list('oportunidades', { limit: 500, order: 'created_at.desc' }, ctx, { companyScoped: true }),
    store.list('tarefas', { limit: 500, order: 'prazo.asc' }, ctx, { companyScoped: true }),
    store.list('conversas', { limit: 500, order: 'updated_at.desc' }, ctx, { companyScoped: true }),
    store.list('campanhas', { limit: 500, order: 'created_at.desc' }, ctx, { companyScoped: true }),
    store.list('usuarios', { limit: 200 }, ctx, { companyScoped: true }),
    ctx.permissions && ctx.permissions.super_admin ? store.list('assinaturas', { limit: 500 }, ctx, { companyScoped: false }) : Promise.resolve([])
  ]);

  const wonLeads = leads.filter(lead => ['ganho', 'Fechado', 'fechado', 'Fechado/Ganho'].includes(lead.status) || ['Fechado', 'Fechado/Ganho'].includes(lead.etapa));
  const lostLeads = leads.filter(lead => ['perdido', 'Perdido'].includes(lead.status) || lead.etapa === 'Perdido');
  const receitaFechada = sum(wonLeads, 'valor') + sum(oportunidades.filter(op => ['ganho', 'fechado'].includes(String(op.status || '').toLowerCase())), 'valor_estimado');
  const receitaPrevista = sum(oportunidades.filter(op => !['perdido', 'ganho', 'fechado'].includes(String(op.status || '').toLowerCase())), 'valor_estimado');
  const investimento = sum(campanhas, 'investimento');
  const tarefasVencidas = tarefas.filter(tarefa => String(tarefa.status || '').toLowerCase() !== 'concluida' && tarefa.prazo && tarefa.prazo < new Date().toISOString().slice(0, 10));
  const conversasAbertas = conversas.filter(conv => ['aberta', 'em atendimento', 'aguardando cliente', 'aguardando atendente'].includes(String(conv.status || '').toLowerCase()));

  const byUser = {};
  for (const lead of leads) {
    const id = lead.vendedor_id || lead.responsavel_id || 'sem_responsavel';
    if (!byUser[id]) byUser[id] = { usuario_id: id, leads: 0, ganhos: 0, receita: 0 };
    byUser[id].leads += 1;
    if (wonLeads.includes(lead)) {
      byUser[id].ganhos += 1;
      byUser[id].receita += Number(lead.valor) || 0;
    }
  }

  const usersById = Object.fromEntries((usuarios || []).map(user => [user.id, user]));
  const ranking_vendedores = Object.values(byUser).map(item => ({
    ...item,
    nome: usersById[item.usuario_id] ? usersById[item.usuario_id].nome : 'Sem responsavel',
    taxa_conversao: item.leads ? item.ganhos / item.leads : 0
  })).sort((a, b) => b.receita - a.receita);

  return {
    periodo: {
      inicio: query.inicio || null,
      fim: query.fim || null
    },
    kpis: {
      total_leads: leads.length,
      leads_ganhos: wonLeads.length,
      leads_perdidos: lostLeads.length,
      conversao_geral: leads.length ? wonLeads.length / leads.length : 0,
      oportunidades_abertas: oportunidades.filter(op => !['perdido', 'ganho', 'fechado'].includes(String(op.status || '').toLowerCase())).length,
      receita_prevista: receitaPrevista,
      receita_fechada: receitaFechada,
      ticket_medio: wonLeads.length ? receitaFechada / wonLeads.length : 0,
      investimento,
      cpl: leads.length ? investimento / leads.length : 0,
      roi: investimento ? receitaFechada / investimento : 0,
      atendimentos_abertos: conversasAbertas.length,
      tarefas_vencidas: tarefasVencidas.length
    },
    leads_por_origem: groupCount(leads, 'origem_nome'),
    leads_por_midia: groupCount(leads, 'midia'),
    leads_por_campanha: groupCount(leads, 'campanha'),
    funil: groupCount(leads, 'etapa'),
    motivos_perda: groupCount(lostLeads, 'motivo_perda'),
    ranking_vendedores,
    campanhas: campanhas.map(campanha => ({
      id: campanha.id,
      nome: campanha.nome,
      canal: campanha.canal,
      investimento: Number(campanha.investimento) || 0,
      leads_gerados: Number(campanha.leads_gerados) || 0,
      receita_gerada: Number(campanha.receita_gerada || campanha.receita) || 0,
      cpl: Number(campanha.leads_gerados) ? (Number(campanha.investimento) || 0) / Number(campanha.leads_gerados) : 0,
      roi: Number(campanha.investimento) ? (Number(campanha.receita_gerada || campanha.receita) || 0) / Number(campanha.investimento) : 0
    })),
    financeiro_saas: ctx.permissions && ctx.permissions.super_admin ? {
      assinaturas: assinaturas.length,
      mrr: sum(assinaturas.filter(sub => ['active', 'ativa', 'paid'].includes(String(sub.status || '').toLowerCase())), 'valor_mensal'),
      churn: average(assinaturas.map(sub => String(sub.status || '').toLowerCase() === 'cancelada' ? 1 : 0))
    } : null
  };
}

module.exports = { buildReportsSummary, groupCount, sum };

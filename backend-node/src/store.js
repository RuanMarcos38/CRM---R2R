const fs = require('fs');
const path = require('path');
const { cleanUrl } = require('./http');
const { sanitizePayload, randomToken, sha256 } = require('./security');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const LOCAL_FILE = path.join(DATA_DIR, 'r2r-crm-local.json');

function now() {
  return new Date().toISOString();
}

function uuid() {
  if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.random() * 16 | 0;
    return (char === 'x' ? value : (value & 0x3 | 0x8)).toString(16);
  });
}

function normalizeOrder(value, fallback = 'created_at.desc') {
  const raw = String(value || fallback || '').trim();
  const [column, direction] = raw.split('.');
  return { column: column || 'created_at', asc: direction === 'asc' };
}

function normalizeValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value !== '' && value !== null && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(String(value))) return Number(value);
  return value;
}

function applyFilters(rows, query, resource) {
  let out = rows.slice();
  for (const [key, value] of Object.entries(query || {})) {
    if (['select', 'limit', 'offset', 'order', 'asc', 'search'].includes(key)) continue;
    if (key.startsWith('eq.')) {
      const field = key.slice(3);
      out = out.filter(row => row[field] === normalizeValue(value));
    } else if (key.startsWith('neq.')) {
      const field = key.slice(4);
      out = out.filter(row => row[field] !== normalizeValue(value));
    } else if (key.startsWith('in.')) {
      const field = key.slice(3);
      const allowed = String(value).split(',').map(item => normalizeValue(item.trim()));
      out = out.filter(row => allowed.includes(row[field]));
    }
  }

  if (query && query.search && resource && resource.search) {
    const term = String(query.search).toLowerCase();
    out = out.filter(row => resource.search.some(field => String(row[field] || '').toLowerCase().includes(term)));
  }

  const order = normalizeOrder(query && query.order, resource && resource.defaultOrder);
  out.sort((a, b) => {
    const av = a[order.column] || '';
    const bv = b[order.column] || '';
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * (order.asc ? 1 : -1);
  });

  const offset = Math.max(0, Number(query && query.offset || 0));
  const limit = Number(query && query.limit || 100);
  return out.slice(offset, offset + Math.min(Math.max(limit, 1), 500));
}

function scopeRows(rows, ctx, resource) {
  if (!resource || !resource.companyScoped || (ctx && ctx.system)) return rows;
  if (ctx && ctx.permissions && ctx.permissions.super_admin && ctx.queryEmpresaId) {
    return rows.filter(row => row.empresa_id === ctx.queryEmpresaId);
  }
  if (ctx && ctx.permissions && ctx.permissions.super_admin && !ctx.empresaId) return rows;
  return rows.filter(row => row.empresa_id === (ctx && ctx.empresaId));
}

function seedLocalData() {
  const empresaId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000010';
  const leadId = '00000000-0000-4000-8000-000000000100';
  return {
    empresas: [{
      id: empresaId,
      nome: 'Empresa Demo',
      slug: 'empresa-demo',
      status: 'ativo',
      plano_id: 'business',
      nome_sistema: 'R2R CRM IA',
      cor_primaria: '#7c3aed',
      created_at: now(),
      updated_at: now()
    }],
    usuarios: [{
      id: userId,
      empresa_id: empresaId,
      auth_user_id: null,
      nome: 'Admin Demo',
      email: 'admin@demo.local',
      funcao: 'Administrador',
      tipo_usuario: 'super_admin',
      status: 'ativo',
      permissoes: {},
      created_at: now(),
      updated_at: now()
    }],
    planos: [
      { id: 'starter', name: 'Starter', price_cents: 79000, max_users: 3, max_leads: 1000, active: true },
      { id: 'business', name: 'Business', price_cents: 150000, max_users: 10, max_leads: 10000, active: true },
      { id: 'premium', name: 'Premium', price_cents: 320000, max_users: null, max_leads: null, active: true }
    ],
    leads: [{
      id: leadId,
      empresa_id: empresaId,
      nome: 'Lead Demo',
      telefone: '+55 47 99999-0000',
      email: 'lead@demo.local',
      empresa: 'Negocio Demo',
      origem_nome: 'Meta Ads',
      origem_lead: 'meta_ads',
      midia: 'paid_social',
      campanha: 'Campanha Demo',
      etapa: 'Novo Lead',
      status: 'novo',
      temperatura: 'quente',
      score: 82,
      valor: 2500,
      tags: ['demo'],
      created_at: now(),
      updated_at: now()
    }],
    clientes: [],
    oportunidades: [],
    funis: [],
    funil_etapas: [],
    atividades: [],
    tarefas: [],
    conversas: [],
    mensagens: [],
    campanhas: [],
    fontes_lead: [],
    configuracoes: [],
    integracoes: [],
    automacoes: [],
    automacao_regras: [],
    arquivos: [],
    tags: [],
    lead_tags: [],
    notificacoes: [],
    webhooks_logs: [],
    billing_webhooks: [],
    audit_logs: [],
    api_keys: [],
    permissoes: [],
    ia_agentes: [],
    templates_nicho: [],
    campos_personalizados: [],
    assinaturas: []
  };
}

class LocalStore {
  constructor() {
    this.kind = 'local';
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(LOCAL_FILE)) fs.writeFileSync(LOCAL_FILE, JSON.stringify(seedLocalData(), null, 2));
  }

  read() {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  }

  write(data) {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
  }

  async list(table, query = {}, ctx = {}, resource = {}) {
    const data = this.read();
    const rows = scopeRows(data[table] || [], ctx, resource);
    return applyFilters(rows, query, resource);
  }

  async get(table, id, ctx = {}, resource = {}) {
    const rows = await this.list(table, { limit: 500 }, ctx, resource);
    return rows.find(row => row.id === id) || null;
  }

  async insert(table, payload, ctx = {}, resource = {}) {
    const data = this.read();
    if (!data[table]) data[table] = [];
    const clean = sanitizePayload(payload, {
      allowSensitive: resource && resource.allowSensitive,
      blockCompanyId: resource && resource.companyScoped && !ctx.system && !(ctx.permissions && ctx.permissions.super_admin)
    });
    const row = { id: uuid(), ...clean, created_at: now(), updated_at: now() };
    if (resource && resource.companyScoped) row.empresa_id = ctx.empresaId || clean.empresa_id;
    data[table].push(row);
    this.write(data);
    return row;
  }

  async update(table, id, payload, ctx = {}, resource = {}) {
    const data = this.read();
    const rows = data[table] || [];
    const index = rows.findIndex(row => row.id === id && scopeRows([row], ctx, resource).length);
    if (index < 0) {
      const error = new Error('Registro nao encontrado.');
      error.statusCode = 404;
      throw error;
    }
    const clean = sanitizePayload(payload, { allowSensitive: resource && resource.allowSensitive, blockCompanyId: true });
    rows[index] = { ...rows[index], ...clean, updated_at: now() };
    this.write(data);
    return rows[index];
  }

  async remove(table, id, ctx = {}, resource = {}) {
    const data = this.read();
    const rows = data[table] || [];
    const row = rows.find(item => item.id === id && scopeRows([item], ctx, resource).length);
    if (!row) {
      const error = new Error('Registro nao encontrado.');
      error.statusCode = 404;
      throw error;
    }
    data[table] = rows.filter(item => item.id !== id);
    this.write(data);
    return row;
  }

  async findProfileByAuthUser(authUser) {
    const data = this.read();
    const email = authUser && authUser.email;
    return (data.usuarios || []).find(user => (authUser.id && user.auth_user_id === authUser.id) || (email && user.email === email)) || null;
  }

  async findApiKey(hash) {
    const data = this.read();
    return (data.api_keys || []).find(row => row.key_hash === hash && row.status !== 'revogada') || null;
  }

  async createApiKey(name, ctx) {
    const plainText = randomToken('r2r');
    const row = await this.insert('api_keys', {
      nome: name,
      key_hash: sha256(plainText),
      prefixo: plainText.slice(0, 12),
      status: 'ativa',
      permissoes: { leads: ['create'], webhooks: ['inbound'] }
    }, ctx, { companyScoped: true, allowSensitive: true });
    return { plainText, publicRow: { ...row, key_hash: undefined } };
  }
}

class SupabaseStore {
  constructor() {
    this.kind = 'supabase';
    this.url = cleanUrl(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || '');
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
    this.rest = `${this.url}/rest/v1`;
  }

  headers(extra = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async request(pathname, options = {}) {
    const response = await fetch(this.rest + pathname, {
      ...options,
      headers: this.headers(options.headers || {})
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!response.ok) {
      const error = new Error((data && (data.message || data.error || data.hint)) || `Supabase HTTP ${response.status}`);
      error.statusCode = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }

  queryString(table, query = {}, ctx = {}, resource = {}) {
    const params = new URLSearchParams();
    params.set('select', query.select || '*');

    if (resource.companyScoped && ctx.system) {
      if (query.empresa_id) params.set('empresa_id', `eq.${query.empresa_id}`);
    } else if (resource.companyScoped && !(ctx.permissions && ctx.permissions.super_admin && !query.empresa_id)) {
      params.set('empresa_id', `eq.${ctx.empresaId}`);
    } else if (query.empresa_id) {
      params.set('empresa_id', `eq.${query.empresa_id}`);
    }

    for (const [key, value] of Object.entries(query || {})) {
      if (['select', 'limit', 'offset', 'order', 'asc', 'search', 'empresa_id'].includes(key)) continue;
      if (key.startsWith('eq.')) params.set(key.slice(3), `eq.${value}`);
      else if (key.startsWith('neq.')) params.set(key.slice(4), `neq.${value}`);
      else if (key.startsWith('in.')) params.set(key.slice(3), `in.(${value})`);
    }

    if (query.search && resource.search && resource.search.length) {
      const term = String(query.search).replace(/[(),]/g, ' ');
      params.set('or', `(${resource.search.map(field => `${field}.ilike.*${term}*`).join(',')})`);
    }

    const order = normalizeOrder(query.order, resource.defaultOrder);
    params.set('order', `${order.column}.${order.asc ? 'asc' : 'desc'}`);
    params.set('limit', String(Math.min(Math.max(Number(query.limit || 100), 1), 500)));
    if (query.offset) params.set('offset', String(Number(query.offset) || 0));
    return `/${table}?${params.toString()}`;
  }

  async list(table, query = {}, ctx = {}, resource = {}) {
    return this.request(this.queryString(table, query, ctx, resource));
  }

  async get(table, id, ctx = {}, resource = {}) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('id', `eq.${id}`);
    if (resource.companyScoped && !ctx.system && !(ctx.permissions && ctx.permissions.super_admin)) params.set('empresa_id', `eq.${ctx.empresaId}`);
    const data = await this.request(`/${table}?${params.toString()}`);
    return data[0] || null;
  }

  async insert(table, payload, ctx = {}, resource = {}) {
    const clean = sanitizePayload(payload, {
      allowSensitive: resource && resource.allowSensitive,
      blockCompanyId: resource && resource.companyScoped && !ctx.system && !(ctx.permissions && ctx.permissions.super_admin)
    });
    if (resource.companyScoped && !clean.empresa_id && !ctx.system) clean.empresa_id = ctx.empresaId;
    const data = await this.request(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(clean)
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async update(table, id, payload, ctx = {}, resource = {}) {
    const clean = sanitizePayload(payload, { allowSensitive: resource && resource.allowSensitive, blockCompanyId: true });
    const params = new URLSearchParams();
    params.set('id', `eq.${id}`);
    if (resource.companyScoped && !ctx.system && !(ctx.permissions && ctx.permissions.super_admin)) params.set('empresa_id', `eq.${ctx.empresaId}`);
    const data = await this.request(`/${table}?${params.toString()}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(clean)
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      const error = new Error('Registro nao encontrado.');
      error.statusCode = 404;
      throw error;
    }
    return row;
  }

  async remove(table, id, ctx = {}, resource = {}) {
    const params = new URLSearchParams();
    params.set('id', `eq.${id}`);
    if (resource.companyScoped && !ctx.system && !(ctx.permissions && ctx.permissions.super_admin)) params.set('empresa_id', `eq.${ctx.empresaId}`);
    const data = await this.request(`/${table}?${params.toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' }
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      const error = new Error('Registro nao encontrado.');
      error.statusCode = 404;
      throw error;
    }
    return row;
  }

  async findProfileByAuthUser(authUser) {
    const email = authUser && authUser.email;
    const params = new URLSearchParams();
    params.set('select', '*');
    if (authUser && authUser.id) params.set('or', `(auth_user_id.eq.${authUser.id},email.eq.${email || ''})`);
    else if (email) params.set('email', `eq.${email}`);
    const data = await this.request(`/usuarios?${params.toString()}`);
    return data[0] || null;
  }

  async findApiKey(hash) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('key_hash', `eq.${hash}`);
    params.set('status', 'eq.ativa');
    const data = await this.request(`/api_keys?${params.toString()}`);
    return data[0] || null;
  }

  async createApiKey(name, ctx) {
    const plainText = randomToken('r2r');
    const row = await this.insert('api_keys', {
      nome: name,
      key_hash: sha256(plainText),
      prefixo: plainText.slice(0, 12),
      status: 'ativa',
      permissoes: { leads: ['create'], webhooks: ['inbound'] }
    }, ctx, { companyScoped: true, allowSensitive: true });
    return { plainText, publicRow: { ...row, key_hash: undefined } };
  }
}

function createStore() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
    return new SupabaseStore();
  }
  return new LocalStore();
}

module.exports = { createStore, LocalStore, SupabaseStore, applyFilters, normalizeOrder, seedLocalData };

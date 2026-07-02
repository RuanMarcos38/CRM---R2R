#!/usr/bin/env node
'use strict';

/**
 * R2R CRM SaaS Backend Enterprise Patch
 * - Sem alteração visual no frontend.
 * - Backend Node.js puro, sem dependências externas obrigatórias.
 * - Supabase/PostgreSQL via REST API.
 * - Multiempresa aplicada no backend por company_id.
 * - Modo de teste em memória apenas quando R2R_TEST_MODE=1.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

loadDotEnv();

const VERSION = '2026.07.02-backend-enterprise-patch';
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'production';
const TEST_MODE = process.env.R2R_TEST_MODE === '1';
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SUPABASE_ANON_KEY = clean(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
const SUPABASE_SERVICE_ROLE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.N8N_WEBHOOK_TOKEN || process.env.EVOLUTION_WEBHOOK_TOKEN || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const REQUIRED_PROD_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const RESOURCE_MAP = Object.freeze({
  empresas: { table: 'companies', companyScoped: false, publicFields: ['id','name','document','status','plan','created_at','updated_at'] },
  companies: { table: 'companies', companyScoped: false, publicFields: ['id','name','document','status','plan','created_at','updated_at'] },
  workspaces: { table: 'workspaces', companyScoped: true },
  users: { table: 'users_profiles', companyScoped: true },
  usuarios: { table: 'users_profiles', companyScoped: true },
  roles: { table: 'roles', companyScoped: true },
  leads: { table: 'leads', companyScoped: true, searchable: ['name','email','phone','source','status'] },
  clientes: { table: 'clients', companyScoped: true, searchable: ['name','email','phone','document'] },
  clients: { table: 'clients', companyScoped: true, searchable: ['name','email','phone','document'] },
  contacts: { table: 'contacts', companyScoped: true, searchable: ['name','email','phone'] },
  pipelines: { table: 'pipelines', companyScoped: true },
  stages: { table: 'pipeline_stages', companyScoped: true },
  opportunities: { table: 'opportunities', companyScoped: true },
  tasks: { table: 'tasks', companyScoped: true, searchable: ['title','status','priority'] },
  tarefas: { table: 'tasks', companyScoped: true, searchable: ['title','status','priority'] },
  conversations: { table: 'conversations', companyScoped: true, searchable: ['contact_name','phone','status'] },
  messages: { table: 'messages', companyScoped: true },
  campaigns: { table: 'campaigns', companyScoped: true, searchable: ['name','provider','status'] },
  metas: { table: 'goals', companyScoped: true },
  goals: { table: 'goals', companyScoped: true },
  integrations: { table: 'integrations', companyScoped: true, maskSecrets: true },
  settings: { table: 'settings', companyScoped: true },
  files: { table: 'files', companyScoped: true },
  arquivos: { table: 'files', companyScoped: true },
  ai_agents: { table: 'ai_agents', companyScoped: true },
  ai_knowledge_base: { table: 'ai_knowledge_base', companyScoped: true },
  billing_plans: { table: 'billing_plans', companyScoped: false },
  subscriptions: { table: 'subscriptions', companyScoped: true },
  audit_logs: { table: 'audit_logs', companyScoped: true },
});

const memory = createMemoryStore();
const rateBuckets = new Map();

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!Object.prototype.hasOwnProperty.call(process.env, match[1])) process.env[match[1]] = value;
  }
}

function clean(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function now() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function safeText(value, max = 5000) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max); }
function isConfigured() { return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY); }
function isSensitiveKey(key) { return /(secret|token|key|password|senha|apikey|api_key|access_token|refresh_token)/i.test(String(key)); }
function maskValue(value) {
  if (value == null || value === '') return value;
  const s = String(value);
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}
function maskSecrets(input) {
  if (Array.isArray(input)) return input.map(maskSecrets);
  if (!input || typeof input !== 'object') return input;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (isSensitiveKey(k)) out[k] = maskValue(v);
    else if (v && typeof v === 'object') out[k] = maskSecrets(v);
    else out[k] = v;
  }
  return out;
}

function allowedOrigin(origin) {
  if (!origin || CORS_ORIGIN === '*') return '*';
  const allowed = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}
function corsHeaders(req) {
  const origin = req?.headers?.origin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey,x-api-key,x-webhook-token,x-r2r-company-id',
    'Access-Control-Max-Age': '86400',
  };
}
function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store',
  };
}
function send(req, res, status, payload, extraHeaders = {}) {
  const isString = typeof payload === 'string' || Buffer.isBuffer(payload);
  const body = Buffer.isBuffer(payload) ? payload : isString ? String(payload) : JSON.stringify(payload, null, NODE_ENV === 'production' ? 0 : 2);
  res.writeHead(status, {
    'Content-Type': isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...corsHeaders(req),
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(body);
}
function ok(req, res, data = {}, message = 'Operação realizada com sucesso') { return send(req, res, 200, { success: true, data, message }); }
function created(req, res, data = {}, message = 'Registro criado com sucesso') { return send(req, res, 201, { success: true, data, message }); }
function fail(req, res, status, error, code = 'ERROR', details) { return send(req, res, status, { success: false, error: safeText(error, 1000), code, ...(details ? { details } : {}) }); }
function notConfigured(req, res) {
  return fail(req, res, 503, 'Supabase não configurado. Preencha SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no backend.', 'SUPABASE_NOT_CONFIGURED');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > Number(process.env.MAX_BODY_BYTES || 5_000_000)) {
        req.destroy();
        reject(new Error('Payload muito grande.'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try { return resolve(JSON.parse(body)); } catch { return reject(new Error('JSON inválido.')); }
      }
      if (contentType.includes('application/x-www-form-urlencoded')) {
        return resolve(Object.fromEntries(new URLSearchParams(body)));
      }
      return resolve({ raw: body });
    });
    req.on('error', reject);
  });
}

function rateLimit(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.url.split('?')[0]}`;
  const nowMs = Date.now();
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX || (req.url.includes('/auth/login') ? 12 : 240));
  const bucket = rateBuckets.get(key) || { start: nowMs, count: 0 };
  if (nowMs - bucket.start > windowMs) { bucket.start = nowMs; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > max) {
    fail(req, res, 429, 'Muitas requisições. Aguarde e tente novamente.', 'RATE_LIMIT');
    return false;
  }
  return true;
}

async function supabaseFetch(pathname, options = {}) {
  if (!isConfigured()) throw new AppError('Supabase não configurado.', 503, 'SUPABASE_NOT_CONFIGURED');
  const url = `${SUPABASE_URL}${pathname.startsWith('/') ? pathname : '/' + pathname}`;
  const headers = {
    apikey: options.anon ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${options.anon ? SUPABASE_ANON_KEY : SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.prefer ? { Prefer: options.prefer } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { method: options.method || 'GET', headers, body: options.body == null ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || `Supabase HTTP ${response.status}`;
    throw new AppError(message, response.status, 'SUPABASE_ERROR', data);
  }
  return { data, headers: response.headers, status: response.status };
}
function restPath(table, query = '') { return `/rest/v1/${encodeURIComponent(table)}${query ? '?' + query : ''}`; }
function q(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') usp.append(k, String(v));
  }
  return usp.toString();
}
function eq(value) { return `eq.${String(value)}`; }

class AppError extends Error {
  constructor(message, status = 500, code = 'APP_ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function authFromRequest(req) {
  if (TEST_MODE) {
    const companyId = req.headers['x-r2r-company-id'] || memory.company.id;
    return { user: memory.user, company: memory.company, companyId, role: 'super_admin', permissions: ['*'], token: 'test' };
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new AppError('Token de autenticação ausente.', 401, 'AUTH_REQUIRED');
  if (!isConfigured()) throw new AppError('Supabase não configurado.', 503, 'SUPABASE_NOT_CONFIGURED');

  const userResult = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const user = await userResult.json().catch(() => ({}));
  if (!userResult.ok || !user?.id) throw new AppError('Token inválido ou expirado.', 401, 'INVALID_TOKEN');

  const requestedCompany = req.headers['x-r2r-company-id'];
  const membershipQuery = q({
    select: 'id,user_id,company_id,role,status,permissions,companies(id,name,status,plan)',
    user_id: eq(user.id),
    status: 'eq.active',
    ...(requestedCompany ? { company_id: eq(requestedCompany) } : {}),
    limit: 1,
  });
  const member = await supabaseFetch(restPath('company_members', membershipQuery));
  const membership = Array.isArray(member.data) ? member.data[0] : null;
  if (!membership) throw new AppError('Usuário sem vínculo ativo com empresa. Verifique company_members no Supabase.', 403, 'NO_COMPANY_MEMBERSHIP');
  return {
    token,
    user,
    profile: null,
    company: membership.companies || { id: membership.company_id },
    companyId: membership.company_id,
    role: membership.role,
    permissions: membership.permissions || [],
    membership,
  };
}

async function requireAuth(req, res) {
  try { return await authFromRequest(req); }
  catch (error) { fail(req, res, error.status || 401, error.message, error.code || 'AUTH_ERROR', error.details); return null; }
}
function requireWebhook(req, res, url) {
  if (!WEBHOOK_SECRET && NODE_ENV === 'production') {
    fail(req, res, 503, 'WEBHOOK_SECRET não configurado no backend.', 'WEBHOOK_SECRET_MISSING');
    return false;
  }
  if (!WEBHOOK_SECRET && NODE_ENV !== 'production') return true;
  const token = req.headers['x-webhook-token'] || req.headers['x-api-key'] || url.searchParams.get('token');
  if (token !== WEBHOOK_SECRET) {
    fail(req, res, 401, 'Token de webhook inválido.', 'INVALID_WEBHOOK_TOKEN');
    return false;
  }
  return true;
}

function sanitizeRecord(input, options = {}) {
  const denied = new Set(['id','created_at','updated_at','deleted_at','company_id','service_role','service_role_key']);
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (denied.has(key) && !options.allowSystem) continue;
    if (/password|service_role/i.test(key)) continue;
    if (typeof value === 'string') out[key] = safeText(value, key.includes('description') || key.includes('notes') ? 10000 : 1000);
    else out[key] = value;
  }
  return out;
}

async function listRecords(resource, ctx, url) {
  if (TEST_MODE) return memoryList(resource.table, ctx.companyId, url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const offset = (page - 1) * limit;
  const queryObj = { select: '*', order: 'created_at.desc', limit, offset };
  if (resource.companyScoped) queryObj.company_id = eq(ctx.companyId);
  const status = url.searchParams.get('status');
  if (status) queryObj.status = eq(status);
  const provider = url.searchParams.get('provider') || url.searchParams.get('tipo');
  if (provider && resource.table === 'integrations') queryObj.provider = eq(provider);
  const result = await supabaseFetch(restPath(resource.table, q(queryObj)));
  const data = resource.maskSecrets ? maskSecrets(result.data || []) : result.data || [];
  return { data, pagination: { page, limit, total: Number(result.headers.get('content-range')?.split('/')?.[1] || data.length) } };
}
async function getRecord(resource, id, ctx) {
  if (TEST_MODE) return memoryGet(resource.table, id, ctx.companyId);
  const queryObj = { select: '*', id: eq(id), limit: 1 };
  if (resource.companyScoped) queryObj.company_id = eq(ctx.companyId);
  const result = await supabaseFetch(restPath(resource.table, q(queryObj)));
  const item = Array.isArray(result.data) ? result.data[0] : null;
  if (!item) throw new AppError('Registro não encontrado.', 404, 'NOT_FOUND');
  return resource.maskSecrets ? maskSecrets(item) : item;
}
async function createRecord(resource, body, ctx) {
  const record = sanitizeRecord(body);
  if (resource.companyScoped) record.company_id = ctx.companyId;
  if (TEST_MODE) return memoryCreate(resource.table, record, ctx.companyId);
  const result = await supabaseFetch(restPath(resource.table), { method: 'POST', body: record, prefer: 'return=representation' });
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
async function updateRecord(resource, id, body, ctx) {
  const patch = sanitizeRecord(body);
  patch.updated_at = now();
  if (TEST_MODE) return memoryUpdate(resource.table, id, patch, ctx.companyId);
  const filters = q({ id: eq(id), ...(resource.companyScoped ? { company_id: eq(ctx.companyId) } : {}) });
  const result = await supabaseFetch(restPath(resource.table, filters), { method: 'PATCH', body: patch, prefer: 'return=representation' });
  const item = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!item) throw new AppError('Registro não encontrado para atualização.', 404, 'NOT_FOUND');
  return item;
}
async function deleteRecord(resource, id, ctx) {
  if (TEST_MODE) return memoryDelete(resource.table, id, ctx.companyId);
  const filters = q({ id: eq(id), ...(resource.companyScoped ? { company_id: eq(ctx.companyId) } : {}) });
  await supabaseFetch(restPath(resource.table, filters), { method: 'DELETE', prefer: 'return=minimal' });
  return { id, deleted: true };
}

async function dashboard(ctx) {
  if (TEST_MODE) {
    return {
      total_leads: memory.leads.length,
      total_clients: memory.clients.length,
      open_tasks: memory.tasks.filter(t => t.status !== 'done').length,
      open_opportunities: memory.opportunities.filter(o => o.status !== 'won' && o.status !== 'lost').length,
      conversations: memory.conversations.length,
      estimated_revenue: memory.opportunities.reduce((sum, o) => sum + Number(o.value || 0), 0),
      generated_at: now(),
    };
  }
  const tables = ['leads','clients','tasks','opportunities','conversations'];
  const out = { generated_at: now() };
  for (const table of tables) {
    try {
      const result = await supabaseFetch(restPath(table, q({ select: 'id,status,value', company_id: eq(ctx.companyId), limit: 1000 })));
      const rows = Array.isArray(result.data) ? result.data : [];
      out[`total_${table}`] = rows.length;
      if (table === 'tasks') out.open_tasks = rows.filter(r => r.status !== 'done' && r.status !== 'completed').length;
      if (table === 'opportunities') {
        out.open_opportunities = rows.filter(r => !['won','lost'].includes(r.status)).length;
        out.estimated_revenue = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);
      }
    } catch (e) {
      out[`total_${table}`] = 0;
      out[`warning_${table}`] = e.message;
    }
  }
  return out;
}

async function handleAuth(req, res, url, body) {
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    if (TEST_MODE) return ok(req, res, { access_token: 'test-token', token_type: 'bearer', user: memory.user, company: memory.company }, 'Login de teste realizado. Use somente em R2R_TEST_MODE=1.');
    if (!isConfigured()) return notConfigured(req, res);
    const email = safeText(body.email || body.usuario || body.login, 320).toLowerCase();
    const password = String(body.password || body.senha || '');
    if (!email || !password) return fail(req, res, 400, 'Informe e-mail e senha.', 'VALIDATION_ERROR');
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authResp.json().catch(() => ({}));
    if (!authResp.ok) return fail(req, res, 401, authData.error_description || authData.msg || 'Login inválido.', 'LOGIN_FAILED');
    const fakeReq = { ...req, headers: { ...req.headers, authorization: `Bearer ${authData.access_token}` } };
    const ctx = await authFromRequest(fakeReq);
    return ok(req, res, { ...authData, company: ctx.company, role: ctx.role, permissions: ctx.permissions }, 'Login realizado com sucesso.');
  }
  if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
    if (!isConfigured()) return notConfigured(req, res);
    const refreshToken = body.refresh_token || body.refreshToken;
    if (!refreshToken) return fail(req, res, 400, 'refresh_token obrigatório.', 'VALIDATION_ERROR');
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return fail(req, res, 401, data.error_description || 'Não foi possível renovar a sessão.', 'REFRESH_FAILED');
    return ok(req, res, data, 'Sessão renovada.');
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const ctx = await requireAuth(req, res); if (!ctx) return;
    return ok(req, res, { user: ctx.user, company: ctx.company, role: ctx.role, permissions: ctx.permissions });
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    return ok(req, res, { logged_out: true }, 'Logout realizado. Remova o token do frontend.');
  }
  if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
    if (!isConfigured()) return notConfigured(req, res);
    const email = safeText(body.email, 320).toLowerCase();
    if (!email) return fail(req, res, 400, 'Informe o e-mail.', 'VALIDATION_ERROR');
    const redirectTo = process.env.PASSWORD_REDIRECT_URL || process.env.FRONTEND_URL || undefined;
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
    });
    if (!resp.ok) return fail(req, res, 400, 'Não foi possível solicitar recuperação de senha.', 'RECOVER_FAILED');
    return ok(req, res, { sent: true }, 'E-mail de recuperação solicitado.');
  }
  return false;
}

async function handleIntegrations(req, res, url, body, ctx) {
  if (url.pathname === '/api/integrations/evolution/test' || url.pathname === '/api/whatsapp/status') {
    return ok(req, res, await testEvolution(), 'Status Evolution verificado.');
  }
  if (url.pathname === '/api/integrations/openai/test' || url.pathname === '/api/ai/test') {
    return ok(req, res, await testOpenAI(), 'Status OpenAI verificado.');
  }
  if (url.pathname === '/api/integrations/meta/connect' || url.pathname === '/api/meta/status') {
    return ok(req, res, { configured: Boolean(process.env.META_ACCESS_TOKEN || process.env.META_APP_ID), message: process.env.META_ACCESS_TOKEN ? 'Meta token configurado no backend.' : 'Configure META_ACCESS_TOKEN ou OAuth seguro no backend.' });
  }
  if (url.pathname === '/api/integrations/google/connect') {
    return ok(req, res, { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), message: 'Google Ads preparado. Configure OAuth no backend para produção.' });
  }
  if (url.pathname === '/api/ai/chat' || url.pathname === '/api/ai/respond') {
    const reply = await openAIChat(body.message || body.text || body.prompt || '', body.history || []);
    return ok(req, res, reply, 'Resposta IA processada.');
  }
  if (url.pathname === '/api/ai/summarize-conversation') {
    const text = safeText(body.text || body.conversation || '', 12000);
    const reply = await openAIChat(`Resuma a conversa e liste próximos passos:\n\n${text}`, []);
    return ok(req, res, reply, 'Resumo gerado.');
  }
  if (url.pathname === '/api/whatsapp/connect' && req.method === 'POST') {
    return ok(req, res, await evolutionConnect(body), 'Solicitação de conexão enviada.');
  }
  if (url.pathname === '/api/whatsapp/disconnect' && req.method === 'POST') {
    return ok(req, res, await evolutionRequest(`/instance/logout/${encodeURIComponent(body.instance || process.env.EVOLUTION_INSTANCE || 'r2r-crm')}`, 'DELETE'), 'Solicitação de desconexão enviada.');
  }
  if (url.pathname === '/api/whatsapp/send-text' || url.pathname.match(/^\/api\/conversations\/[^/]+\/send-message$/)) {
    return ok(req, res, await sendWhatsAppText(body, ctx), 'Mensagem enviada/processada.');
  }
  if (url.pathname === '/api/whatsapp/send-media') {
    return ok(req, res, await sendWhatsAppMedia(body, ctx), 'Mídia enviada/processada.');
  }
  return false;
}

async function testOpenAI() {
  if (!process.env.OPENAI_API_KEY) return { configured: false, message: 'OPENAI_API_KEY não configurada no backend.' };
  const resp = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
  return { configured: resp.ok, status: resp.status, model: OPENAI_MODEL };
}
async function openAIChat(message, history) {
  if (!process.env.OPENAI_API_KEY) return { configured: false, reply: 'OPENAI_API_KEY não configurada no backend.' };
  const messages = [
    { role: 'system', content: process.env.AI_SYSTEM_PROMPT || 'Você é um agente comercial profissional do CRM R2R. Responda em português do Brasil, com clareza, objetividade e sem inventar dados.' },
    ...(Array.isArray(history) ? history.slice(-12) : []),
    { role: 'user', content: safeText(message, 12000) || 'Olá' },
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature: Number(process.env.OPENAI_TEMPERATURE || 0.4) }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new AppError(data.error?.message || 'Falha na OpenAI.', resp.status, 'OPENAI_ERROR');
  return { configured: true, model: OPENAI_MODEL, reply: data.choices?.[0]?.message?.content || '' };
}
function evolutionConfig(body = {}) {
  return {
    url: clean(process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL || body.url),
    key: process.env.EVOLUTION_API_KEY || body.key || body.apikey || '',
    instance: body.instance || body.instanceName || body.inst || process.env.EVOLUTION_INSTANCE || 'r2r-crm',
  };
}
async function evolutionRequest(pathname, method = 'GET', body = {}) {
  const cfg = evolutionConfig(body);
  if (!cfg.url || !cfg.key) return { configured: false, message: 'Evolution API não configurada no backend.' };
  const resp = await fetch(cfg.url + pathname, { method, headers: { 'Content-Type': 'application/json', apikey: cfg.key }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  const text = await resp.text();
  let data = text; try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!resp.ok) throw new AppError(data?.message || data?.error || `Evolution HTTP ${resp.status}`, resp.status, 'EVOLUTION_ERROR', data);
  return { configured: true, data };
}
async function testEvolution() {
  const cfg = evolutionConfig();
  if (!cfg.url || !cfg.key) return { configured: false, connected: false, message: 'EVOLUTION_API_URL e EVOLUTION_API_KEY não configuradas.' };
  const result = await evolutionRequest('/instance/fetchInstances', 'GET');
  const list = Array.isArray(result.data) ? result.data : (result.data?.data || []);
  const found = Array.isArray(list) ? list.find(i => i.name === cfg.instance || i.instanceName === cfg.instance) : null;
  return { configured: true, connected: ['open','connected'].includes(found?.connectionStatus || found?.status), instance: cfg.instance, status: found?.connectionStatus || found?.status || 'not_found' };
}
async function evolutionConnect(body) {
  const cfg = evolutionConfig(body);
  if (!cfg.url || !cfg.key) return { configured: false, message: 'Configure Evolution no .env para gerar QR Code.' };
  try { await evolutionRequest('/instance/create', 'POST', { instanceName: cfg.instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' }); } catch (_) {}
  const data = await evolutionRequest(`/instance/connect/${encodeURIComponent(cfg.instance)}`, 'GET');
  const raw = data.data || {};
  const qr = raw.base64 || raw.qrcode || raw.qr || raw?.data?.qrcode || null;
  return { configured: true, qrcode: qr, qr, raw };
}
async function sendWhatsAppText(body, ctx) {
  const number = safeText(body.number || body.phone || body.to, 40);
  const text = safeText(body.text || body.message || body.body, 5000);
  if (!number || !text) throw new AppError('Informe number/phone e text/message.', 400, 'VALIDATION_ERROR');
  const cfg = evolutionConfig(body);
  const result = await evolutionRequest(`/message/sendText/${encodeURIComponent(cfg.instance)}`, 'POST', { number, text });
  if (!TEST_MODE && isConfigured()) {
    await createRecord(RESOURCE_MAP.messages, { direction: 'outbound', phone: number, content: text, channel: 'whatsapp', provider_response: result.data }, ctx).catch(() => null);
  }
  return result;
}
async function sendWhatsAppMedia(body, ctx) {
  const number = safeText(body.number || body.phone || body.to, 40);
  const media = safeText(body.media || body.url || body.mediaUrl, 2000);
  if (!number || !media) throw new AppError('Informe number/phone e media/url.', 400, 'VALIDATION_ERROR');
  const cfg = evolutionConfig(body);
  return evolutionRequest(`/message/sendMedia/${encodeURIComponent(cfg.instance)}`, 'POST', { number, mediatype: body.mediatype || body.type || 'image', media, caption: safeText(body.caption || '', 1000) });
}

async function handleWebhook(req, res, url, body) {
  if (!requireWebhook(req, res, url)) return;
  const source = url.pathname.includes('evolution') || url.pathname.includes('whatsapp') ? 'whatsapp' : 'n8n';
  if (!isConfigured() && !TEST_MODE) return notConfigured(req, res);
  const companyId = body.company_id || body.companyId || body.empresa_id || process.env.DEFAULT_COMPANY_ID;
  if (!companyId && !TEST_MODE) return fail(req, res, 400, 'company_id obrigatório no payload ou DEFAULT_COMPANY_ID no .env.', 'COMPANY_REQUIRED');
  const ctx = TEST_MODE ? { companyId: memory.company.id } : { companyId };
  const message = extractInboundMessage(body, source);
  if (message.phone || message.content) {
    await createRecord(RESOURCE_MAP.conversations, {
      phone: message.phone,
      contact_name: message.name,
      channel: source,
      status: 'open',
      last_message_at: now(),
      metadata: body,
    }, ctx).catch(() => null);
    await createRecord(RESOURCE_MAP.messages, {
      direction: 'inbound',
      phone: message.phone,
      contact_name: message.name,
      content: message.content,
      channel: source,
      message_type: message.type,
      provider_payload: body,
    }, ctx).catch(() => null);
  }
  if (body.lead || body.name || body.nome || body.email || body.phone || body.telefone) {
    await createRecord(RESOURCE_MAP.leads, {
      name: body.name || body.nome || body.lead?.name || body.lead?.nome || message.name,
      email: body.email || body.lead?.email,
      phone: body.phone || body.telefone || body.lead?.phone || message.phone,
      source,
      status: 'new',
      notes: body.notes || body.observacao || '',
      metadata: body,
    }, ctx).catch(() => null);
  }
  return ok(req, res, { received: true, source, at: now() }, 'Webhook recebido com segurança.');
}
function extractInboundMessage(body, source) {
  const data = body.data || body.message || body;
  const key = data.key || {};
  const msg = data.message || data.messages || data;
  const content = msg.conversation || msg.text || msg.body || msg?.extendedTextMessage?.text || body.text || body.message || '';
  const phone = body.phone || body.telefone || data.phone || key.remoteJid || body.from || '';
  const name = body.name || body.nome || data.pushName || data.name || '';
  const type = body.type || data.messageType || source;
  return { phone: String(phone).replace(/@s\.whatsapp\.net|@c\.us/g, ''), name, content, type };
}

async function handleReports(req, res, url, ctx) {
  if (url.pathname === '/api/dashboard/summary' || url.pathname === '/api/dashboard/metrics' || url.pathname === '/api/dashboard/charts' || url.pathname === '/api/reports/overview' || url.pathname === '/api/reports/dashboard') {
    return ok(req, res, await dashboard(ctx), 'Dashboard carregado.');
  }
  if (url.pathname === '/api/reports/leads') {
    return ok(req, res, await listRecords(RESOURCE_MAP.leads, ctx, url), 'Relatório de leads carregado.');
  }
  if (url.pathname === '/api/reports/sales') {
    return ok(req, res, await listRecords(RESOURCE_MAP.opportunities, ctx, url), 'Relatório comercial carregado.');
  }
  if (url.pathname === '/api/reports/campaigns') {
    return ok(req, res, await listRecords(RESOURCE_MAP.campaigns, ctx, url), 'Relatório de campanhas carregado.');
  }
  if (url.pathname === '/api/reports/export') {
    const data = await dashboard(ctx);
    return send(req, res, 200, JSON.stringify(data, null, 2), { 'Content-Disposition': 'attachment; filename="r2r-report.json"', 'Content-Type': 'application/json; charset=utf-8' });
  }
  return false;
}

async function handleSpecialRoutes(req, res, url, body, ctx) {
  const convertLead = url.pathname.match(/^\/api\/leads\/([^/]+)\/convert(?:-to-client)?$/);
  if (convertLead && req.method === 'POST') {
    const lead = await getRecord(RESOURCE_MAP.leads, convertLead[1], ctx);
    const client = await createRecord(RESOURCE_MAP.clientes, { name: lead.name, email: lead.email, phone: lead.phone, source_lead_id: lead.id, status: 'active', metadata: { lead } }, ctx);
    await updateRecord(RESOURCE_MAP.leads, lead.id, { status: 'converted', converted_client_id: client.id }, ctx).catch(() => null);
    return ok(req, res, { lead_id: lead.id, client }, 'Lead convertido em cliente.');
  }
  const moveOpp = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/move$/);
  if (moveOpp && req.method === 'POST') {
    const updated = await updateRecord(RESOURCE_MAP.opportunities, moveOpp[1], { stage_id: body.stage_id || body.stageId, pipeline_stage_id: body.pipeline_stage_id || body.stage_id, status: body.status }, ctx);
    return ok(req, res, updated, 'Oportunidade movida no funil.');
  }
  const completeTask = url.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/) || url.pathname.match(/^\/api\/tarefas\/([^/]+)\/complete$/);
  if (completeTask && req.method === 'POST') {
    const updated = await updateRecord(RESOURCE_MAP.tasks, completeTask[1], { status: 'done', completed_at: now() }, ctx);
    return ok(req, res, updated, 'Tarefa concluída.');
  }
  const pipelineStages = url.pathname.match(/^\/api\/pipelines\/([^/]+)\/stages$/);
  if (pipelineStages) {
    if (req.method === 'GET') {
      const fakeUrl = new URL(url.toString());
      fakeUrl.searchParams.set('pipeline_id', pipelineStages[1]);
      if (TEST_MODE) return ok(req, res, memory.pipeline_stages.filter(s => s.pipeline_id === pipelineStages[1]), 'Etapas carregadas.');
      const result = await supabaseFetch(restPath('pipeline_stages', q({ select: '*', company_id: eq(ctx.companyId), pipeline_id: eq(pipelineStages[1]), order: 'position.asc' })));
      return ok(req, res, result.data || [], 'Etapas carregadas.');
    }
    if (req.method === 'POST') {
      const createdStage = await createRecord(RESOURCE_MAP.stages, { ...body, pipeline_id: pipelineStages[1] }, ctx);
      return created(req, res, createdStage, 'Etapa criada.');
    }
  }
  const convMessages = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (convMessages) {
    if (req.method === 'GET') {
      if (TEST_MODE) return ok(req, res, memory.messages.filter(m => m.conversation_id === convMessages[1]), 'Mensagens carregadas.');
      const result = await supabaseFetch(restPath('messages', q({ select: '*', company_id: eq(ctx.companyId), conversation_id: eq(convMessages[1]), order: 'created_at.asc', limit: 200 })));
      return ok(req, res, result.data || [], 'Mensagens carregadas.');
    }
    if (req.method === 'POST') {
      const createdMessage = await createRecord(RESOURCE_MAP.messages, { ...body, conversation_id: convMessages[1], direction: body.direction || 'outbound' }, ctx);
      return created(req, res, createdMessage, 'Mensagem salva.');
    }
  }
  return false;
}

async function handleResourceRoute(req, res, url, body, ctx) {
  const match = url.pathname.match(/^\/api\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;
  const name = match[1];
  const id = match[2];
  const resource = RESOURCE_MAP[name];
  if (!resource) return false;

  if (!id && req.method === 'GET') {
    const out = await listRecords(resource, ctx, url);
    return send(req, res, 200, { success: true, data: out.data, pagination: out.pagination, message: 'Registros carregados.' });
  }
  if (!id && req.method === 'POST') return created(req, res, await createRecord(resource, body, ctx));
  if (id && req.method === 'GET') return ok(req, res, await getRecord(resource, id, ctx));
  if (id && (req.method === 'PUT' || req.method === 'PATCH')) return ok(req, res, await updateRecord(resource, id, body, ctx));
  if (id && req.method === 'DELETE') return ok(req, res, await deleteRecord(resource, id, ctx), 'Registro removido.');
  return false;
}

async function handleApi(req, res, url) {
  const body = ['POST','PUT','PATCH'].includes(req.method) ? await parseBody(req) : {};

  if (url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/api/health' || url.pathname === '/api/version') {
    return ok(req, res, {
      service: 'r2r-crm-saas-backend',
      version: VERSION,
      node: process.version,
      env: NODE_ENV,
      testMode: TEST_MODE,
      supabaseConfigured: isConfigured(),
      missingEnv: REQUIRED_PROD_ENV.filter(k => !process.env[k]),
      integrations: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        evolution: Boolean((process.env.EVOLUTION_API_URL || process.env.EVOLUTION_URL) && process.env.EVOLUTION_API_KEY),
        meta: Boolean(process.env.META_ACCESS_TOKEN || process.env.META_APP_ID),
        google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        n8n: Boolean(process.env.N8N_WEBHOOK_URL || process.env.N8N_WEBHOOK_TOKEN),
      },
      time: now(),
    }, 'Backend online.');
  }

  const authHandled = await handleAuth(req, res, url, body);
  if (authHandled !== false) return authHandled;

  if (url.pathname.startsWith('/api/webhooks/')) return handleWebhook(req, res, url, body);

  const ctx = await requireAuth(req, res); if (!ctx) return;

  const reportHandled = await handleReports(req, res, url, ctx); if (reportHandled !== false) return reportHandled;
  const integrationHandled = await handleIntegrations(req, res, url, body, ctx); if (integrationHandled !== false) return integrationHandled;
  const specialHandled = await handleSpecialRoutes(req, res, url, body, ctx); if (specialHandled !== false) return specialHandled;
  const resourceHandled = await handleResourceRoute(req, res, url, body, ctx); if (resourceHandled !== false) return resourceHandled;

  return fail(req, res, 404, 'Rota não encontrada.', 'NOT_FOUND');
}

function serveStatic(req, res, url) {
  if (!fs.existsSync(PUBLIC_DIR)) return fail(req, res, 404, 'Frontend não encontrado neste backend. Configure PUBLIC_DIR ou hospede o frontend separado.', 'FRONTEND_NOT_FOUND');
  let filePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  filePath = path.join(PUBLIC_DIR, filePath);
  const root = path.resolve(PUBLIC_DIR);
  if (!filePath.startsWith(root)) return send(req, res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(root, 'index.html');
  if (!fs.existsSync(filePath)) return send(req, res, 404, 'Not found');
  const ext = path.extname(filePath).toLowerCase();
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' }[ext] || 'application/octet-stream';
  let content = fs.readFileSync(filePath);
  const headers = { 'Content-Type': type, ...corsHeaders(req), ...securityHeaders(), 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' };
  if (ext === '.html') {
    const apiBase = process.env.PUBLIC_API_BASE || process.env.API_URL || '';
    if (apiBase) {
      const injection = `<script>window.R2R_API_BASE=window.R2R_API_BASE||${JSON.stringify(clean(apiBase))};</script>`;
      content = Buffer.from(String(content).replace('<head>', '<head>' + injection));
    }
  }
  res.writeHead(200, headers);
  res.end(content);
}

function createMemoryStore() {
  const company = { id: '00000000-0000-4000-8000-000000000001', name: 'R2R Test Company', status: 'active', plan: 'premium', created_at: now(), updated_at: now() };
  const user = { id: '00000000-0000-4000-8000-000000000002', email: 'admin@r2rmarketingdigital.com.br', name: 'Administrador R2R' };
  return {
    company,
    user,
    companies: [company],
    users_profiles: [{ id: user.id, company_id: company.id, email: user.email, name: user.name, role: 'super_admin', created_at: now(), updated_at: now() }],
    leads: [], clients: [], contacts: [], pipelines: [{ id: uuid(), company_id: company.id, name: 'Funil Comercial', status: 'active', created_at: now(), updated_at: now() }],
    pipeline_stages: [], opportunities: [], tasks: [], conversations: [], messages: [], campaigns: [], goals: [], integrations: [], settings: [], files: [], ai_agents: [], ai_knowledge_base: [], billing_plans: [], subscriptions: [], audit_logs: [], workspaces: [], roles: [],
  };
}
function memoryList(table, companyId, url) {
  let rows = [...(memory[table] || [])];
  if (rows.some(r => r.company_id)) rows = rows.filter(r => r.company_id === companyId);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  return { data: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length } };
}
function memoryGet(table, id, companyId) {
  const row = (memory[table] || []).find(r => r.id === id && (!r.company_id || r.company_id === companyId));
  if (!row) throw new AppError('Registro não encontrado.', 404, 'NOT_FOUND');
  return row;
}
function memoryCreate(table, record, companyId) {
  const row = { id: uuid(), ...record, company_id: record.company_id || companyId, created_at: now(), updated_at: now() };
  if (!memory[table]) memory[table] = [];
  memory[table].push(row);
  return row;
}
function memoryUpdate(table, id, patch, companyId) {
  const rows = memory[table] || [];
  const idx = rows.findIndex(r => r.id === id && (!r.company_id || r.company_id === companyId));
  if (idx < 0) throw new AppError('Registro não encontrado.', 404, 'NOT_FOUND');
  rows[idx] = { ...rows[idx], ...patch, updated_at: now() };
  return rows[idx];
}
function memoryDelete(table, id, companyId) {
  const rows = memory[table] || [];
  const idx = rows.findIndex(r => r.id === id && (!r.company_id || r.company_id === companyId));
  if (idx < 0) throw new AppError('Registro não encontrado.', 404, 'NOT_FOUND');
  const [removed] = rows.splice(idx, 1);
  return { id: removed.id, deleted: true };
}

const server = http.createServer(async (req, res) => {
  try {
    if (!rateLimit(req, res)) return;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...corsHeaders(req), ...securityHeaders() });
      return res.end();
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/') || ['/health','/healthz'].includes(url.pathname)) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[R2R CRM BACKEND ERROR]', { message: error.message, stack: error.stack, code: error.code });
    return fail(req, res, status, error.message || 'Erro interno.', error.code || 'INTERNAL_ERROR', NODE_ENV === 'production' ? undefined : error.details);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`R2R CRM backend ${VERSION} rodando na porta ${PORT}`);
    if (!isConfigured() && !TEST_MODE) console.warn('Atenção: Supabase ainda não configurado. Preencha .env antes do deploy real.');
    if (TEST_MODE) console.warn('R2R_TEST_MODE=1 ativo. Use somente para testes automatizados locais.');
  });
}

module.exports = { server, VERSION };

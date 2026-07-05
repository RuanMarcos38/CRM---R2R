(function () {
  'use strict';

  window.R2R_BRIDGE_VERSION = '20260704-full-backend';
  console.log('[R2R] Backend bridge version', window.R2R_BRIDGE_VERSION);

  var TABLE_ENDPOINTS = {
    leads: '/api/leads',
    clientes: '/api/clientes',
    clients: '/api/clientes',
    oportunidades: '/api/oportunidades',
    funis: '/api/funis',
    funil_etapas: '/api/funil-etapas',
    atividades: '/api/atividades',
    lead_historico: '/api/lead-historico',
    tarefas: '/api/tarefas',
    conversas: '/api/conversas',
    mensagens: '/api/mensagens',
    campanhas: '/api/campanhas',
    fontes_lead: '/api/fontes-lead',
    configuracoes: '/api/configuracoes',
    integracoes: '/api/integracoes',
    automacoes: '/api/automacoes',
    feature_flags: '/api/feature-flags',
    usuarios: '/api/usuarios',
    empresas: '/api/empresas',
    notificacoes: '/api/notificacoes',
    tags: '/api/tags'
  };

  var original = {
    sbQ: window.sbQ,
    sbIns: window.sbIns,
    sbUpd: window.sbUpd,
    sbDel: window.sbDel
  };

  var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  var discoveredApiBase = '';

  function xhrFetch(input, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open((opts.method || 'GET').toUpperCase(), String(input), true);
      xhr.timeout = opts.timeout || 20000;
      var headers = opts.headers || {};
      if (headers && typeof headers.forEach === 'function') {
        headers.forEach(function (value, key) { xhr.setRequestHeader(key, value); });
      } else {
        Object.keys(headers || {}).forEach(function (key) {
          if (headers[key] !== undefined && headers[key] !== null) xhr.setRequestHeader(key, headers[key]);
        });
      }
      xhr.onload = function () {
        var body = xhr.responseText || '';
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: {
            get: function (name) { return xhr.getResponseHeader(name); }
          },
          text: function () { return Promise.resolve(body); },
          json: function () { return Promise.resolve(body ? JSON.parse(body) : {}); }
        });
      };
      xhr.onerror = function () { reject(new Error('Falha de rede')); };
      xhr.ontimeout = function () { reject(new Error('Tempo esgotado')); };
      xhr.send(opts.body || null);
    });
  }

  function httpFetch(input, opts) {
    return nativeFetch ? nativeFetch(input, opts || {}) : xhrFetch(input, opts || {});
  }

  if (!nativeFetch && typeof window.XMLHttpRequest === 'function') {
    window.fetch = xhrFetch;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function inputValue(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    for (var i = 0; i < ids.length; i += 1) {
      var el = byId(ids[i]);
      if (el && typeof el.value !== 'undefined' && String(el.value).trim()) return String(el.value).trim();
    }
    return '';
  }

  function checked(id) {
    var el = byId(id);
    return !!(el && el.checked);
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
  }

  function cleanUrl(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url) && /^[A-Za-z0-9.-]+(?::\d+)?(\/|$)/.test(url)) {
      url = /^(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(url) ? 'http://' + url : 'https://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  function currentOrigin() {
    try { return cleanUrl(window.location.origin); } catch (e) { return ''; }
  }

  function rememberApiBase(base) {
    base = cleanUrl(base);
    if (!base) return;
    discoveredApiBase = base;
    window.R2R_API_BASE = base;
    try { localStorage.setItem('r2r_api_base', base); } catch (e) {}
  }

  function apiBase() {
    return cleanUrl(discoveredApiBase || window.R2R_API_BASE || localStorage.getItem('r2r_api_base') || currentOrigin());
  }

  function apiBaseCandidates() {
    var list = [];
    function add(value) {
      value = cleanUrl(value);
      if (value && list.indexOf(value) === -1) list.push(value);
    }
    try { add(localStorage.getItem('r2r_api_base')); } catch (e) {}
    add(window.R2R_API_BASE);
    add(currentOrigin());
    try {
      var host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        add(window.location.protocol + '//' + host + ':3000');
        add(window.location.protocol + '//' + host + ':3001');
      }
      if (host === 'crm.r2rmarketingdigital.com.br') add('https://api.r2rmarketingdigital.com.br');
      if (host.indexOf('crm.') === 0) add(window.location.protocol + '//api.' + host.slice(4));
    } catch (e) {}
    return list;
  }

  function allowDirectDataFallback() {
    var env = String(window.R2R_CONFIG && window.R2R_CONFIG.ENV || '').toLowerCase();
    var host = String(window.location && window.location.hostname || '').toLowerCase();
    return window.R2R_ALLOW_DIRECT_SUPABASE_FALLBACK === true
      || env === 'development'
      || window.location.protocol === 'file:'
      || host === 'localhost'
      || host === '127.0.0.1';
  }

  function backendRequired(table, fallbackValue) {
    toast('Backend/API indisponivel para ' + table + '. Em producao, os dados passam somente pelo backend.', 'error');
    return fallbackValue;
  }

  function responseHeader(res, name) {
    try {
      return res && res.headers && typeof res.headers.get === 'function' ? String(res.headers.get(name) || '') : '';
    } catch (e) {
      return '';
    }
  }

  function assertApiResponse(res, path) {
    if (String(path || '').indexOf('/api/') !== 0) return res;
    var contentType = responseHeader(res, 'content-type').toLowerCase();
    if (res && res.ok && contentType.indexOf('text/html') >= 0) {
      throw new Error('A URL da API esta apontando para o frontend. Configure o backend em https://api.r2rmarketingdigital.com.br.');
    }
    return res;
  }

  async function discoverBackend() {
    if (discoveredApiBase) return discoveredApiBase;
    var candidates = apiBaseCandidates();
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var res = await httpFetch(candidates[i] + '/api/health', { cache: 'no-store', timeout: 5000 });
        if (!res.ok) continue;
        var data = {};
        try { data = await res.json(); } catch (jsonError) {}
        if (data && data.ok) {
          rememberApiBase(candidates[i]);
          return discoveredApiBase;
        }
      } catch (e) {}
    }
    return apiBase();
  }

  async function apiRequest(path, opts) {
    var base = await discoverBackend();
      try {
        return assertApiResponse(await httpFetch(base + path, opts || {}), path);
      } catch (firstError) {
      discoveredApiBase = '';
      var candidates = apiBaseCandidates().filter(function (candidate) { return candidate !== base; });
      var lastError = firstError;
      for (var i = 0; i < candidates.length; i += 1) {
        try {
          var res = assertApiResponse(await httpFetch(candidates[i] + path, opts || {}), path);
          rememberApiBase(candidates[i]);
          return res;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }
  }

  function endpointFor(table) {
    return TABLE_ENDPOINTS[table] || ('/api/' + String(table || '').replace(/_/g, '-'));
  }

  async function sessionToken() {
    if (!window.SB && typeof window.initSupabase === 'function') await window.initSupabase();
    if (!window.SB || !window.SB.auth) return '';
    var session = await window.SB.auth.getSession();
    return session && session.data && session.data.session && session.data.session.access_token || '';
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    var token = await sessionToken();
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    var res = await apiRequest(path, Object.assign({}, opts, { headers: headers }));
    var data = {};
    var text = '';
    try { text = await res.text(); } catch (e) {}
    if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ': backend/API indisponivel.');
      throw new Error('Backend indisponivel: a rota da API retornou HTML do frontend.');
    }
    try { data = text ? JSON.parse(text) : {}; } catch (e) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      throw new Error('Backend retornou resposta invalida em JSON.');
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  }

  window.r2rApiFetch = apiFetch;
  window.r2rApi = async function (path, opts) {
    path = String(path || '/api/health');
    if (path === '/health' || path === '/healthz') path = '/api/health';
    return apiFetch(path, opts || {});
  };
  window.R2RBridge = {
    apiFetch: apiFetch,
    checkBackendHealth: checkBackendHealth,
    backendReady: backendReady,
    discoverBackend: discoverBackend
  };

  function queryFor(select, opts) {
    opts = opts || {};
    var params = new URLSearchParams();
    if (select) params.set('select', select);
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.order) params.set('order', opts.order + '.' + (opts.asc ? 'asc' : 'desc'));
    if (opts.search) params.set('search', opts.search);
    if (opts.eq) Object.keys(opts.eq).forEach(function (key) { params.set('eq.' + key, opts.eq[key]); });
    var qs = params.toString();
    return qs ? '?' + qs : '';
  }

  async function backendReady() {
    try {
      var base = await discoverBackend();
      if (!base) return false;
      var res = await httpFetch(base + '/api/health', { cache: 'no-store', timeout: 5000 });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function checkBackendHealth() {
    var base = await discoverBackend();
    if (!base) throw new Error('Backend offline ou URL da API incorreta. Verifique config.js.');
    var res = await httpFetch(base + '/health', { cache: 'no-store', timeout: 5000 });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || data.ok === false) {
      throw new Error((data && (data.error || data.message)) || 'Backend offline ou URL da API incorreta. Verifique config.js.');
    }
    toast('Backend online: ' + (data.version || base), 'success');
    return data;
  }

  window.checkBackendHealth = checkBackendHealth;

  window.sbQ = async function (table, select, opts) {
    if (!window.R2R_BACKEND_READY && original.sbQ && allowDirectDataFallback()) return original.sbQ(table, select, opts || {});
    if (!window.R2R_BACKEND_READY && original.sbQ && !allowDirectDataFallback()) return backendRequired(table, []);
    try {
      var data = await apiFetch(endpointFor(table) + queryFor(select || '*', opts || {}));
      return data.data || [];
    } catch (error) {
      console.warn('[R2R API] sbQ fallback', table, error.message);
      if (original.sbQ && allowDirectDataFallback()) return original.sbQ(table, select, opts || {});
      toast('Erro ao carregar ' + table + ': ' + error.message, 'error');
      return [];
    }
  };

  window.sbIns = async function (table, payload) {
    if (!window.R2R_BACKEND_READY && original.sbIns && allowDirectDataFallback()) return original.sbIns(table, payload || {});
    if (!window.R2R_BACKEND_READY && original.sbIns && !allowDirectDataFallback()) return backendRequired(table, null);
    try {
      var data = await apiFetch(endpointFor(table), { method: 'POST', body: JSON.stringify(payload || {}) });
      return data.data || null;
    } catch (error) {
      console.warn('[R2R API] sbIns fallback', table, error.message);
      if (original.sbIns && allowDirectDataFallback()) return original.sbIns(table, payload || {});
      toast('Erro ao salvar: ' + error.message, 'error');
      return null;
    }
  };

  window.sbUpd = async function (table, id, payload) {
    if (!window.R2R_BACKEND_READY && original.sbUpd && allowDirectDataFallback()) return original.sbUpd(table, id, payload || {});
    if (!window.R2R_BACKEND_READY && original.sbUpd && !allowDirectDataFallback()) return backendRequired(table, false);
    try {
      await apiFetch(endpointFor(table) + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload || {}) });
      return true;
    } catch (error) {
      console.warn('[R2R API] sbUpd fallback', table, error.message);
      if (original.sbUpd && allowDirectDataFallback()) return original.sbUpd(table, id, payload || {});
      toast('Erro ao atualizar: ' + error.message, 'error');
      return false;
    }
  };

  window.sbDel = async function (table, id) {
    if (!window.R2R_BACKEND_READY && original.sbDel && allowDirectDataFallback()) return original.sbDel(table, id);
    if (!window.R2R_BACKEND_READY && original.sbDel && !allowDirectDataFallback()) return backendRequired(table, false);
    try {
      await apiFetch(endpointFor(table) + '/' + encodeURIComponent(id), { method: 'DELETE' });
      return true;
    } catch (error) {
      console.warn('[R2R API] sbDel fallback', table, error.message);
      if (original.sbDel && allowDirectDataFallback()) return original.sbDel(table, id);
      toast('Erro ao excluir: ' + error.message, 'error');
      return false;
    }
  };

  function clearFrontendSecrets() {
    var sensitive = [
      'r2r_evo_key',
      'r2r_wa_meta_token',
      'r2r_api_key'
    ];
    sensitive.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    try {
      var wa = JSON.parse(localStorage.getItem('r2r_wa_cfg') || '{}');
      if (wa.key) {
        delete wa.key;
        localStorage.setItem('r2r_wa_cfg', JSON.stringify(wa));
      }
    } catch (e) {}
    try {
      var ia = JSON.parse(localStorage.getItem('r2r_ia_cfg') || '{}');
      if (ia.key || ia.apiKey) {
        delete ia.key;
        delete ia.apiKey;
        localStorage.setItem('r2r_ia_cfg', JSON.stringify(ia));
      }
    } catch (e) {}
  }

  async function loadRuntimeConfig() {
    try {
      var base = await discoverBackend();
      var res = await httpFetch(base + '/api/config', { cache: 'no-store', timeout: 5000 });
      if (!res.ok) return;
      var cfg = await res.json();
      if (cfg.api_base) {
        window.R2R_API_BASE = cleanUrl(cfg.api_base);
        localStorage.setItem('r2r_api_base', window.R2R_API_BASE);
      }
      if (cfg.supabase && cfg.supabase.url && cfg.supabase.publishable_key) {
        window.R2R_SUPABASE_URL = cfg.supabase.url;
        window.R2R_SUPABASE_ANON_KEY = cfg.supabase.publishable_key;
        localStorage.setItem('r2r_sb_url', cfg.supabase.url);
        localStorage.setItem('r2r_sb_anon_key', cfg.supabase.publishable_key);
      }
      window.R2R_PUBLIC_CONFIG = cfg;
    } catch (e) {
      console.warn('[R2R config]', e.message);
    }
  }

  window.gerarNovaAPIKey = async function () {
    try {
      var data = await apiFetch('/api/api-keys', { method: 'POST', body: JSON.stringify({ nome: 'API Publica' }) });
      var el = byId('apiKeyDisplay');
      if (el) el.textContent = data.api_key;
      toast('API Key gerada no backend. Ela sera exibida apenas uma vez.', 'success');
    } catch (error) {
      toast('Nao foi possivel gerar API Key: ' + error.message, 'error');
    }
  };

  window.testarBackendR2R = async function () {
    try {
      var base = await discoverBackend();
      var res = await httpFetch(base + '/api/health', { cache: 'no-store', timeout: 5000 });
      var data = await res.json();
      if (data.ok) {
        window.R2R_BACKEND_READY = true;
        toast('Backend conectado: ' + data.storage, 'success');
      } else {
        toast('Backend respondeu com erro.', 'error');
      }
    } catch (error) {
      toast('Backend inacessivel: ' + error.message, 'error');
    }
  };
  window.testarBackendCompleto = window.testarBackendR2R;

  window.salvarBackendUrl = function () {
    var input = byId('backendUrl') || byId('backendUrlInput') || byId('apiBaseInput') || byId('r2rBackendUrl');
    var url = input && input.value ? cleanUrl(input.value) : apiBase();
    if (!url) return toast('Informe a URL do backend.', 'warn');
    window.R2R_API_BASE = url;
    localStorage.setItem('r2r_api_base', url);
    toast('URL do backend salva.', 'success');
    if (typeof window.renderTestsGrid === 'function') window.renderTestsGrid();
  };

  function readWAConfigFromForm() {
    var urlEl = byId('waEvoUrl') || byId('waEvoUrl2');
    var keyEl = byId('waEvoKey') || byId('waEvoKey2');
    var instEl = byId('waEvoInst') || byId('waEvoInstance') || byId('waEvoInst2');
    return {
      url: cleanUrl(urlEl && urlEl.value || window.WA_CFG && window.WA_CFG.url || ''),
      apiKey: String(keyEl && keyEl.value || '').trim(),
      instance: String(instEl && instEl.value || window.WA_CFG && (window.WA_CFG.inst || window.WA_CFG.instance) || 'r2r-crm').trim() || 'r2r-crm'
    };
  }

  function setWAConfigFields(config) {
    config = config || {};
    ['waEvoUrl', 'waEvoUrl2'].forEach(function (id) {
      var el = byId(id);
      if (el && config.url) el.value = config.url;
    });
    ['waEvoInst', 'waEvoInstance', 'waEvoInst2'].forEach(function (id) {
      var el = byId(id);
      if (el) el.value = config.instance || config.inst || 'r2r-crm';
    });
    ['waEvoKey', 'waEvoKey2'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.value = '';
        el.placeholder = config.has_api_key ? 'API Key salva no backend - preencha apenas para trocar' : 'Chave global da Evolution API';
      }
    });
    window.WA_CFG = { url: config.url || '', inst: config.instance || config.inst || 'r2r-crm', key: '' };
    try { localStorage.setItem('r2r_wa_cfg', JSON.stringify(window.WA_CFG)); } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function qrElements() {
    var canvas = byId('waCanvas') || byId('waQrCanvas');
    var load = byId('waLoading') || byId('waQrLoading');
    var box = byId('waQrBox') || (canvas && canvas.parentNode) || (load && load.parentNode);
    return { canvas: canvas, load: load, box: box };
  }

  function setQrBusy(message) {
    var els = qrElements();
    if (els.canvas) els.canvas.style.display = 'none';
    if (els.load) {
      els.load.style.display = 'flex';
      els.load.innerHTML = '<span class="spinner"></span>' + escapeHtml(message || 'Gerando QR Code...');
    }
  }

  function setQrMessage(message, type) {
    var els = qrElements();
    var color = type === 'error' ? '#b91c1c' : (type === 'success' ? '#166534' : '#334155');
    if (els.canvas) els.canvas.style.display = 'none';
    if (els.load) {
      els.load.style.display = 'flex';
      els.load.innerHTML = '<span style="display:block;text-align:center;line-height:1.45;color:' + color + ';padding:8px">' + escapeHtml(message) + '</span>';
    } else if (els.box) {
      els.box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:180px;text-align:center;color:' + color + ';padding:12px">' + escapeHtml(message) + '</div>';
    }
  }

  function normalizeQr(qr) {
    if (!qr) return '';
    if (typeof qr === 'string') return qr.trim();
    if (qr.base64) return String(qr.base64).trim();
    if (qr.qrcode) return normalizeQr(qr.qrcode);
    if (qr.qr) return normalizeQr(qr.qr);
    if (qr.data) return normalizeQr(qr.data);
    return '';
  }

  function renderQr(qr) {
    var value = normalizeQr(qr);
    if (!value) return false;
    var src = value.indexOf('data:') === 0 ? value : 'data:image/png;base64,' + value;
    var els = qrElements();
    var img = new Image();
    img.onload = function () {
      if (els.canvas && els.canvas.getContext) {
        els.canvas.width = 210;
        els.canvas.height = 210;
        els.canvas.getContext('2d').clearRect(0, 0, 210, 210);
        els.canvas.getContext('2d').drawImage(img, 0, 0, 210, 210);
        els.canvas.style.display = 'block';
        if (els.load) els.load.style.display = 'none';
      } else if (els.load) {
        els.load.style.display = 'flex';
        els.load.innerHTML = '<img src="' + src + '" alt="QR Code WhatsApp" style="width:210px;height:210px;border-radius:8px">';
      }
    };
    img.onerror = function () {
      setQrMessage('A Evolution retornou QR, mas a imagem nao pode ser renderizada. Verifique a resposta da API.', 'error');
    };
    img.src = src;
    return true;
  }

  function applyWATabButtonState(activeTab) {
    ['wtc', 'evo', 'meta'].forEach(function (tab) {
      var btn = byId('wa-tab-' + tab);
      if (!btn) return;
      var active = tab === activeTab;
      btn.style.background = active ? 'var(--purple)' : 'transparent';
      btn.style.color = active ? '#fff' : 'var(--gray2)';
      btn.style.border = active ? 'none' : '1px solid var(--border)';
    });
  }

  function repairWhatsappPanels() {
    var card = byId('stab-whatsapp');
    if (!card) return false;
    ['wtc', 'evo', 'meta'].forEach(function (tab) {
      var panel = byId('wa-panel-' + tab);
      if (panel && panel.parentNode !== card) {
        card.appendChild(panel);
      }
    });
    return true;
  }

  window.switchWATab = function (tab) {
    tab = ['wtc', 'evo', 'meta'].indexOf(tab) >= 0 ? tab : 'evo';
    repairWhatsappPanels();
    ['wtc', 'evo', 'meta'].forEach(function (item) {
      var panel = byId('wa-panel-' + item);
      if (panel) panel.style.display = item === tab ? 'block' : 'none';
    });
    applyWATabButtonState(tab);
    if (tab === 'evo') {
      loadWAConfig().then(function () {
        var cfg = readWAConfigFromForm();
        if (!cfg.url) setQrMessage('Preencha URL, API Key e instancia da Evolution para gerar o QR Code.', 'warn');
        else window.checkWAStatus && window.checkWAStatus();
      });
    }
    if (tab === 'meta' && typeof window.carregarMetaWACfg === 'function') window.carregarMetaWACfg();
    if (tab === 'wtc' && typeof window.atualizarStatusWTC === 'function') window.atualizarStatusWTC();
  };

  function wireWhatsappTabs() {
    repairWhatsappPanels();
    var activeTab = 'wtc';
    ['evo', 'meta', 'wtc'].forEach(function (tab) {
      var panel = byId('wa-panel-' + tab);
      if (panel && panel.style.display !== 'none') activeTab = tab;
    });
    ['wtc', 'evo', 'meta'].forEach(function (tab) {
      var btn = byId('wa-tab-' + tab);
      if (!btn) return;
      btn.onclick = function (event) {
        if (event && event.preventDefault) event.preventDefault();
        window.switchWATab(tab);
        return false;
      };
    });
    applyWATabButtonState(activeTab);
  }

  async function loadWAConfig() {
    try {
      var data = await apiFetch('/api/integrations/whatsapp', { method: 'GET' });
      if (data && data.config) setWAConfigFields(data.config);
      return data;
    } catch (error) {
      return null;
    }
  }

  async function saveWAConfigIfNeeded(requireKey) {
    var cfg = readWAConfigFromForm();
    if (!cfg.url) {
      if (requireKey) toast('Informe a URL da Evolution API.', 'warn');
      if (requireKey) setQrMessage('Preencha a URL da Evolution API e a API Key Global antes de conectar.', 'error');
      return false;
    }
    if (!cfg.apiKey && requireKey) {
      var current = await loadWAConfig();
      if (current && current.configured) return true;
      toast('Informe a API Key Global da Evolution API.', 'warn');
      setQrMessage('Informe a API Key Global ou salve uma configuracao valida no backend.', 'error');
      return false;
    }
    if (!cfg.apiKey) return true;
    var data = await apiFetch('/api/integrations/whatsapp', {
      method: 'POST',
      body: JSON.stringify(cfg)
    });
    if (data && data.config) setWAConfigFields(data.config);
    return true;
  }

  window.carregarWACfg = loadWAConfig;

  window.salvarWAConfig = async function () {
    try {
      var cfg = readWAConfigFromForm();
      if (!cfg.url) return toast('Informe a URL da Evolution API.', 'warn');
      if (!cfg.apiKey) return toast('Informe a API Key Global para salvar ou trocar a chave.', 'warn');
      var data = await apiFetch('/api/integrations/whatsapp', {
        method: 'POST',
        body: JSON.stringify(cfg)
      });
      if (data && data.config) setWAConfigFields(data.config);
      toast('Evolution API salva no backend. Agora clique em Conectar.', 'success');
    } catch (error) {
      toast('Nao foi possivel salvar WhatsApp: ' + error.message, 'error');
    }
  };

  window.testarEvoAPI = window.checkWAStatus = async function () {
    try {
      await saveWAConfigIfNeeded(false);
      var data = await apiFetch('/api/whatsapp/status', { method: 'GET' });
      var dot = byId('waStatusDot');
      var txt = byId('waStatusTxt');
      if (dot) dot.style.background = data.connected ? '#22c55e' : '#f97316';
      if (txt) txt.textContent = data.connected ? 'Conectado' : (data.configured ? 'Configurado, aguardando conexao' : 'Nao configurado');
      if (!data.configured) setQrMessage(data.message || 'WhatsApp nao configurado. Preencha URL, API Key e instancia.', 'error');
      toast(data.connected ? 'WhatsApp conectado.' : (data.message || 'Status WhatsApp atualizado.'), data.connected ? 'success' : 'info');
    } catch (error) {
      toast('Erro WhatsApp: ' + error.message, 'error');
      setQrMessage('Erro ao verificar WhatsApp: ' + error.message, 'error');
    }
  };

  window.conectarWA = window.conectarWhatsApp = async function () {
    try {
      setQrBusy('Gerando QR Code...');
      var cfg = readWAConfigFromForm();
      var saved = await saveWAConfigIfNeeded(true);
      if (!saved) return;
      var payload = { instance: cfg.instance };
      if (cfg.url) payload.url = cfg.url;
      if (cfg.apiKey) payload.apiKey = cfg.apiKey;
      var data = await apiFetch('/api/whatsapp/connect', { method: 'POST', body: JSON.stringify(payload) });
      var qr = data.qr || data.qrcode || data.base64 || data.data;
      if (!data.configured) {
        setQrMessage(data.message || 'WhatsApp nao configurado no backend.', 'error');
        toast(data.message || 'WhatsApp nao configurado.', 'warn');
      } else if (renderQr(qr)) {
        toast('QR Code gerado pelo backend.', 'success');
      } else if (data.pairing_code) {
        setQrMessage('A Evolution retornou codigo de pareamento: ' + data.pairing_code, 'warn');
        toast('A Evolution retornou codigo de pareamento, nao QR Code.', 'warn');
      } else {
        setQrMessage(data.message || 'A Evolution API respondeu, mas nao retornou QR Code. Verifique URL, API Key e nome da instancia.', data.ok === false ? 'error' : 'warn');
        toast(data.message || 'Solicitacao enviada para Evolution API.', 'info');
      }
    } catch (error) {
      toast('Erro ao conectar WhatsApp: ' + error.message, 'error');
      setQrMessage('Erro ao conectar WhatsApp: ' + error.message, 'error');
    }
  };

  window.desconectarWA = async function () {
    try {
      await apiFetch('/api/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({}) });
      toast('Comando de desconexao enviado.', 'success');
    } catch (error) {
      toast('Erro ao desconectar: ' + error.message, 'error');
    }
  };

  window.testarMetaWA = window.testarConexaoMeta = async function () {
    try {
      var data = await apiFetch('/api/meta/status', { method: 'GET' });
      toast(data.configured ? 'Meta conectada pelo backend.' : (data.message || 'Meta nao configurada.'), data.configured ? 'success' : 'info');
    } catch (error) {
      toast('Erro Meta: ' + error.message, 'error');
    }
  };

  window.carregarMetaAdsCampanhas = async function () {
    var tbody = byId('metaAdsTable') || document.querySelector('#page-metaads table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray2)">Sincronizando pelo backend...</td></tr>';
    try {
      var data = await apiFetch('/api/meta/campaigns', { method: 'GET' });
      var rows = data.data && data.data.data ? data.data.data : (Array.isArray(data.data) ? data.data : []);
      if (!rows.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--gray2)">Nenhuma campanha retornada ou Meta nao configurada.</td></tr>';
        return;
      }
      if (tbody) {
        tbody.innerHTML = rows.map(function (campaign) {
          var insights = campaign.insights && campaign.insights.data && campaign.insights.data[0] || {};
          var spend = Number(insights.spend || 0);
          var leads = (insights.actions || []).filter(function (a) { return a.action_type === 'lead'; }).reduce(function (sum, a) { return sum + Number(a.value || 0); }, 0);
          var cpl = leads ? 'R$' + (spend / leads).toFixed(2) : '-';
          return '<tr><td><strong>' + (campaign.name || '-') + '</strong></td><td>' + (campaign.objective || '-') + '</td><td>R$ ' + spend.toFixed(2) + '</td><td>' + (insights.impressions || insights.reach || '-') + '</td><td>' + leads + '</td><td>' + cpl + '</td><td><span class="badge badge-blue">' + (campaign.status || '-') + '</span></td></tr>';
        }).join('');
      }
      toast('Campanhas sincronizadas pelo backend.', 'success');
    } catch (error) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#fca5a5">' + error.message + '</td></tr>';
      toast('Erro Meta Ads: ' + error.message, 'error');
    }
  };

  async function saveIntegration(type, payload) {
    return apiFetch('/api/integrations/' + encodeURIComponent(type), {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  window.salvarIA = window.saveIAConfig = async function () {
    try {
      var payload = {
        provider: inputValue('aiProv') || 'openai',
        model: inputValue('aiModelo') || 'gpt-4o-mini',
        apiKey: inputValue('aiKey'),
        mode: inputValue('aiMode') || 'suggestion',
        active: checked('aiAtivo')
      };
      if (!payload.apiKey) return toast('Informe a API Key da IA para salvar no backend.', 'warn');
      await saveIntegration('ai', payload);
      var keyEl = byId('aiKey');
      if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = 'API Key salva no backend - preencha apenas para trocar';
      }
      toast('IA salva com seguranca no backend.', 'success');
    } catch (error) {
      toast('Erro ao salvar IA: ' + error.message, 'error');
    }
  };

  window.testarIA = async function () {
    try {
      var data = await apiFetch('/api/ai/test', { method: 'POST', body: JSON.stringify({}) });
      toast(data.configured ? 'IA conectada pelo backend.' : (data.message || data.reply || 'IA nao configurada.'), data.configured ? 'success' : 'info');
    } catch (error) {
      toast('Erro ao testar IA: ' + error.message, 'error');
    }
  };

  window.salvarN8NConfig = async function () {
    try {
      var payload = {
        url: inputValue('n8nUrl'),
        apiKey: inputValue('n8nApiKey'),
        webhookUrl: inputValue('n8nWebhookUrl'),
        events: {
          novo_lead: checked('ev-novo-lead'),
          etapa: checked('ev-etapa'),
          fechado: checked('ev-fechado'),
          mensagem: checked('ev-mensagem'),
          tarefa: checked('ev-tarefa'),
          solicitacao: checked('ev-solicitacao')
        }
      };
      if (!payload.url && !payload.webhookUrl) return toast('Informe a URL base ou webhook do N8N.', 'warn');
      await saveIntegration('n8n', payload);
      var keyEl = byId('n8nApiKey');
      if (keyEl) {
        keyEl.value = '';
        keyEl.placeholder = 'API Key salva no backend - preencha apenas para trocar';
      }
      var badge = byId('n8nBadge');
      if (badge) {
        badge.textContent = 'Configurado';
        badge.style.color = '#86efac';
      }
      toast('N8N salvo no backend.', 'success');
    } catch (error) {
      toast('Erro ao salvar N8N: ' + error.message, 'error');
    }
  };

  window.testarN8N = window.testarWebhookN8N = async function () {
    try {
      var data = await apiFetch('/api/n8n/test', { method: 'POST', body: JSON.stringify({}) });
      toast(data.configured ? 'N8N testado pelo backend.' : (data.message || 'N8N nao configurado.'), data.configured ? 'success' : 'info');
    } catch (error) {
      toast('Erro N8N: ' + error.message, 'error');
    }
  };

  window.salvarMetaWAConfig = async function () {
    try {
      var payload = {
        phoneNumberId: inputValue('waMetaPhoneId'),
        wabaId: inputValue('waMetaWabaId'),
        businessId: inputValue('waMetaBusinessId'),
        verifyToken: inputValue('waMetaVerify'),
        token: inputValue('waMetaToken'),
        accessToken: inputValue('waMetaToken'),
        adAccountId: inputValue(['metaAdAccountId', 'metaAccountId'])
      };
      if (!payload.token && !payload.phoneNumberId && !payload.wabaId) return toast('Informe pelo menos Token, Phone Number ID ou WABA ID da Meta.', 'warn');
      await saveIntegration('meta', payload);
      var tokenEl = byId('waMetaToken');
      if (tokenEl) {
        tokenEl.value = '';
        tokenEl.placeholder = 'Token salvo no backend - preencha apenas para trocar';
      }
      toast('Meta salva com seguranca no backend.', 'success');
    } catch (error) {
      toast('Erro ao salvar Meta: ' + error.message, 'error');
    }
  };

  window.sincronizarTemplatesMeta = async function () {
    try {
      var data = await apiFetch('/api/meta/status', { method: 'GET' });
      toast(data.configured ? 'Meta sincronizada pelo backend.' : (data.message || 'Meta ainda nao configurada no backend.'), data.configured ? 'success' : 'info');
    } catch (error) {
      toast('Erro Meta: ' + error.message, 'error');
    }
  };

  window.salvarWhatickConfig = async function () {
    toast('Token do Whaticket deve ficar no backend ou em cofre de segredos. O frontend nao persiste esse token.', 'info');
  };

  window.gerarRelatorio = async function () {
    try {
      var data = await apiFetch('/api/reports/summary', { method: 'GET' });
      window.R2R_LAST_REPORT = data.data;
      toast('Relatorio atualizado com dados reais.', 'success');
      if (typeof window.carregarDashboard === 'function') window.carregarDashboard();
    } catch (error) {
      toast('Erro ao gerar relatorio: ' + error.message, 'error');
    }
  };

  window.testarSupabaseR2R = async function () {
    try {
      var data = await apiFetch('/api/me', { method: 'GET' });
      toast(data.profile ? 'Supabase/Auth OK: ' + (data.profile.email || 'usuario conectado') : 'Login OK, perfil ausente em usuarios.', data.profile ? 'success' : 'warn');
    } catch (error) {
      toast('Supabase/Auth: ' + error.message, 'error');
    }
  };

  window.testarCardsTabelas = async function () {
    try {
      var tables = ['/api/leads?limit=1', '/api/clientes?limit=1', '/api/tarefas?limit=1', '/api/campanhas?limit=1', '/api/atendimentos?limit=1'];
      await Promise.all(tables.map(function (path) { return apiFetch(path, { method: 'GET' }); }));
      toast('Tabelas principais respondendo pelo backend.', 'success');
    } catch (error) {
      toast('Erro nas tabelas/cards: ' + error.message, 'error');
    }
  };

  window.renderTestsGrid = function () {
    var box = byId('testsGrid') || byId('integrationsTestsGrid') || byId('testesGrid');
    if (!box) return;
    var base = apiBase();
    var items = [
      { label: 'Backend/API', sub: base || 'Nao configurado', fn: 'testarBackendCompleto()' },
      { label: 'Supabase/Auth', sub: 'Valida sessao e perfil', fn: 'testarSupabaseR2R()' },
      { label: 'Cards/Tabelas', sub: 'Leads, clientes, tarefas e atendimentos', fn: 'testarCardsTabelas()' },
      { label: 'WhatsApp/Evolution', sub: 'Status pelo backend', fn: 'testarEvoAPI()' },
      { label: 'IA/OpenAI', sub: 'Teste pelo backend', fn: 'testarIA()' },
      { label: 'Meta', sub: 'Teste pelo backend', fn: 'testarMetaWA()' },
      { label: 'N8N', sub: 'Teste pelo backend', fn: 'testarN8N()' }
    ];
    box.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      + '<input id="backendUrlInput" value="' + escapeHtml(base) + '" placeholder="https://api.r2rmarketingdigital.com.br" style="flex:1;min-width:260px;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:7px;color:var(--text1);font-family:inherit;font-size:.83rem;outline:none">'
      + '<button onclick="salvarBackendUrl()" style="padding:9px 14px;background:var(--purple);border:none;border-radius:7px;color:#fff;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">Salvar URL</button>'
      + '<button onclick="testarBackendCompleto()" style="padding:9px 14px;background:transparent;border:1px solid var(--border);border-radius:7px;color:var(--gray2);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit">Testar Backend</button>'
      + '</div>'
      + items.map(function (item) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:8px">'
          + '<div><div style="font-weight:700;color:var(--text1);font-size:.84rem">' + escapeHtml(item.label) + '</div><div style="color:var(--gray2);font-size:.75rem;margin-top:2px">' + escapeHtml(item.sub) + '</div></div>'
          + '<button onclick="' + item.fn + '" style="padding:7px 14px;background:var(--purple);border:none;border-radius:7px;color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit">Testar</button>'
          + '</div>';
      }).join('');
  };

  function setPermissionsFromBackend(data) {
    if (!data || !data.permissions) return;
    var p = data.permissions || {};
    window.PERMISSOES = Object.assign({}, window.PERMISSOES || {}, {
      tipo: p.tipo || p.role || 'usuario',
      role: p.role || p.tipo || 'usuario',
      admin: !!p.admin,
      super_admin: !!p.super_admin,
      company_admin: !!p.company_admin,
      manager: !!p.manager,
      pode_criar: p.can_write !== false,
      pode_editar: p.can_write !== false,
      pode_excluir: !!(p.super_admin || p.company_admin || p.admin),
      pode_config: !!(p.super_admin || p.company_admin || p.admin),
      pode_usuarios: !!(p.super_admin || p.company_admin || p.admin)
    });
  }

  function hideFeatureSelectors(feature, disabled) {
    var map = {
      meta_ads: ["[onclick*=\"showPage('metaads')\"]", '[onclick*="abrirModalMetaAds"]', '#page-metaads'],
      whatsapp: ["[onclick*=\"showSettingsTab('whatsapp')\"]", '#tab-whatsapp', '#wa-panel-evo', '#wa-panel-meta', '#wa-panel-wtc'],
      ai: ["[onclick*=\"showPage('ai')\"]", "[onclick*=\"showSettingsTab('ia')\"]", '#page-ai', '#tab-ia'],
      n8n: ["[onclick*=\"showSettingsTab('n8n')\"]", "[onclick*=\"showSettingsTab('api')\"]", '#apiPanel-n8n'],
      billing: ["[onclick*=\"showPage('financial')\"]", '#page-financial']
    };
    (map[feature] || []).forEach(function (selector) {
      try {
        document.querySelectorAll(selector).forEach(function (el) {
          el.style.display = disabled ? 'none' : '';
          el.setAttribute('data-feature-hidden', disabled ? feature : '');
        });
      } catch (e) {}
    });
  }

  function applyFeatureFlagsUI(flags) {
    window.R2R_FEATURES = Object.assign({}, window.R2R_FEATURES || {}, flags || {});
    Object.keys(window.R2R_FEATURES).forEach(function (feature) {
      hideFeatureSelectors(feature, window.R2R_FEATURES[feature] === false);
    });
  }

  async function loadSecurityContext() {
    try {
      var data = await apiFetch('/api/me', { method: 'GET' });
      setPermissionsFromBackend(data);
      applyFeatureFlagsUI(data.features || {});
      return data;
    } catch (error) {
      return null;
    }
  }

  window.carregarFeatureFlags = async function () {
    try {
      var data = await apiFetch('/api/features', { method: 'GET' });
      applyFeatureFlagsUI(data.features || {});
      return data.features || {};
    } catch (error) {
      console.warn('[R2R features]', error.message);
      return {};
    }
  };

  document.addEventListener('DOMContentLoaded', async function () {
    clearFrontendSecrets();
    wireWhatsappTabs();
    setTimeout(wireWhatsappTabs, 800);
    await loadRuntimeConfig();
    window.R2R_BACKEND_READY = await backendReady();
    if (window.R2R_BACKEND_READY) console.log('[R2R] Backend bridge ativo');
    if (window.R2R_BACKEND_READY) await loadSecurityContext();
    setTimeout(function () { clearFrontendSecrets(); applyFeatureFlagsUI(window.R2R_FEATURES || {}); }, 1200);
  });
})();

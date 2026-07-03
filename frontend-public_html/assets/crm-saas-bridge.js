(function () {
  'use strict';

  window.R2R_BRIDGE_VERSION = '20260703-wa-config-hardfix';
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

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
  }

  function cleanUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function normalizeInstanceName(value) {
    var normalized = String(value || 'r2r-crm')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return normalized || 'r2r-crm';
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
    } catch (e) {}
    return list;
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
      return await httpFetch(base + path, opts || {});
    } catch (firstError) {
      discoveredApiBase = '';
      var candidates = apiBaseCandidates().filter(function (candidate) { return candidate !== base; });
      var lastError = firstError;
      for (var i = 0; i < candidates.length; i += 1) {
        try {
          var res = await httpFetch(candidates[i] + path, opts || {});
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
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  }

  window.r2rApiFetch = apiFetch;
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
    if (!window.R2R_BACKEND_READY && original.sbQ) return original.sbQ(table, select, opts || {});
    try {
      var data = await apiFetch(endpointFor(table) + queryFor(select || '*', opts || {}));
      return data.data || [];
    } catch (error) {
      console.warn('[R2R API] sbQ fallback', table, error.message);
      if (original.sbQ) return original.sbQ(table, select, opts || {});
      toast('Erro ao carregar ' + table + ': ' + error.message, 'error');
      return [];
    }
  };

  window.sbIns = async function (table, payload) {
    if (!window.R2R_BACKEND_READY && original.sbIns) return original.sbIns(table, payload || {});
    try {
      var data = await apiFetch(endpointFor(table), { method: 'POST', body: JSON.stringify(payload || {}) });
      return data.data || null;
    } catch (error) {
      console.warn('[R2R API] sbIns fallback', table, error.message);
      if (original.sbIns) return original.sbIns(table, payload || {});
      toast('Erro ao salvar: ' + error.message, 'error');
      return null;
    }
  };

  window.sbUpd = async function (table, id, payload) {
    if (!window.R2R_BACKEND_READY && original.sbUpd) return original.sbUpd(table, id, payload || {});
    try {
      await apiFetch(endpointFor(table) + '/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload || {}) });
      return true;
    } catch (error) {
      console.warn('[R2R API] sbUpd fallback', table, error.message);
      if (original.sbUpd) return original.sbUpd(table, id, payload || {});
      toast('Erro ao atualizar: ' + error.message, 'error');
      return false;
    }
  };

  window.sbDel = async function (table, id) {
    if (!window.R2R_BACKEND_READY && original.sbDel) return original.sbDel(table, id);
    try {
      await apiFetch(endpointFor(table) + '/' + encodeURIComponent(id), { method: 'DELETE' });
      return true;
    } catch (error) {
      console.warn('[R2R API] sbDel fallback', table, error.message);
      if (original.sbDel) return original.sbDel(table, id);
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

  window.salvarBackendUrl = function () {
    var input = byId('backendUrl') || byId('apiBaseInput') || byId('r2rBackendUrl');
    var url = input && input.value ? cleanUrl(input.value) : apiBase();
    if (!url) return toast('Informe a URL do backend.', 'warn');
    window.R2R_API_BASE = url;
    localStorage.setItem('r2r_api_base', url);
    toast('URL do backend salva.', 'success');
  };

  function readWAConfigFromForm() {
    ensureEvolutionConfigPanel();
    var urlEl = byId('waEvoUrl') || byId('waEvoUrl2');
    var keyEl = byId('waEvoKey') || byId('waEvoKey2');
    var instEl = byId('waEvoInst') || byId('waEvoInstance') || byId('waEvoInst2');
    var instance = normalizeInstanceName(instEl && instEl.value || window.WA_CFG && (window.WA_CFG.inst || window.WA_CFG.instance) || 'r2r-crm');
    if (instEl && instEl.value !== instance) instEl.value = instance;
    return {
      url: cleanUrl(urlEl && urlEl.value || window.WA_CFG && window.WA_CFG.url || ''),
      apiKey: String(keyEl && keyEl.value || '').trim(),
      instance: instance
    };
  }

  function setWAConfigFields(config) {
    config = config || {};
    ensureEvolutionConfigPanel();
    ['waEvoUrl', 'waEvoUrl2'].forEach(function (id) {
      var el = byId(id);
      if (el && config.url) el.value = config.url;
    });
    ['waEvoInst', 'waEvoInstance', 'waEvoInst2'].forEach(function (id) {
      var el = byId(id);
      if (el) el.value = normalizeInstanceName(config.instance || config.inst || 'r2r-crm');
    });
    ['waEvoKey', 'waEvoKey2'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.value = '';
        el.placeholder = config.has_api_key ? 'API Key salva no backend - preencha apenas para trocar' : 'Chave global da Evolution API';
      }
    });
    window.WA_CFG = { url: config.url || '', inst: normalizeInstanceName(config.instance || config.inst || 'r2r-crm'), key: '' };
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

  function nearestPanelChild(el, panel, grid) {
    var node = el;
    while (node && node !== panel) {
      if (grid && node.parentNode === grid) return node;
      if (!grid && node.parentNode === panel) return node;
      node = node.parentNode;
    }
    return null;
  }

  function makeVisible(el, display) {
    if (!el || !el.style) return;
    if (el.classList) el.classList.remove('hidden');
    el.hidden = false;
    el.style.display = display || '';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  }

  function firstDirectGrid(panel) {
    if (!panel || !panel.children) return null;
    for (var i = 0; i < panel.children.length; i += 1) {
      var child = panel.children[i];
      if (child.classList && child.classList.contains('r2r-wa-evo-grid')) return child;
      if (child.style && String(child.style.gridTemplateColumns || '').trim()) return child;
    }
    return panel.querySelector('.r2r-wa-evo-grid') || panel.querySelector('[style*="grid-template-columns"]');
  }

  function buildEvolutionConfigPanel() {
    var panel = document.createElement('div');
    panel.id = 'waEvoConfigBloco';
    panel.innerHTML =
      '<div style="font-size:.82rem;font-weight:700;color:var(--text1);margin-bottom:10px">Configurar Evolution API</div>' +
      '<div id="waEvoConfigHint" style="background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:11px;font-size:.75rem;color:var(--gray2);line-height:1.7;margin-bottom:12px">' +
        '<strong style="color:var(--text2)">Dados necessarios:</strong> URL publica da Evolution, API Key Global e nome da instancia.' +
      '</div>' +
      '<div class="form-group"><label>URL da Evolution API</label><input type="text" id="waEvoUrl" placeholder="https://evolution.seudominio.com.br"></div>' +
      '<div class="form-group"><label>API Key Global</label><input type="password" id="waEvoKey" placeholder="Chave global da Evolution API"></div>' +
      '<div class="form-group"><label>Nome da Instancia</label><input type="text" id="waEvoInst" value="r2r-crm" placeholder="r2r-crm"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
        '<button type="button" onclick="salvarWAConfig()" style="padding:8px 16px;background:var(--purple);border:none;border-radius:6px;color:#fff;font-weight:600;font-size:.81rem;cursor:pointer;font-family:inherit">Salvar</button>' +
        '<button type="button" onclick="testarEvoAPI()" style="padding:8px 14px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--gray2);font-size:.81rem;cursor:pointer;font-family:inherit">Testar conexao</button>' +
      '</div>' +
      '<div id="evoResult" style="margin-top:9px;font-size:.77rem;display:none"></div>';
    return panel;
  }

  function ensureEvolutionConfigPanel() {
    var panel = byId('wa-panel-evo');
    if (!panel) return false;

    var grid = firstDirectGrid(panel);
    var urlEl = byId('waEvoUrl') || byId('waEvoUrl2');
    var configPanel = (urlEl && nearestPanelChild(urlEl, panel, grid)) || byId('waEvoConfigBloco');
    var qrBox = byId('waQrBox');
    var qrColumn = qrBox && nearestPanelChild(qrBox, panel, grid);

    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'r2r-wa-evo-grid';
      if (qrColumn) grid.appendChild(qrColumn);
      panel.appendChild(grid);
    }

    if (grid.classList) grid.classList.add('r2r-wa-evo-grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'minmax(210px,240px) minmax(280px,1fr)';
    grid.style.gap = '20px';
    grid.style.alignItems = 'start';
    grid.style.width = '100%';

    Array.prototype.forEach.call(grid.children || [], function (child) {
      makeVisible(child, '');
    });

    if (!configPanel || !configPanel.querySelector || !configPanel.querySelector('#waEvoUrl')) {
      configPanel = buildEvolutionConfigPanel();
      grid.appendChild(configPanel);
    }

    if (qrColumn && qrColumn.parentNode !== grid) {
      grid.insertBefore(qrColumn, grid.firstChild || null);
    }
    if (configPanel.parentNode !== grid) {
      grid.appendChild(configPanel);
    }

    configPanel.id = 'waEvoConfigBloco';
    if (configPanel.classList) configPanel.classList.add('r2r-wa-config-column');
    makeVisible(configPanel, 'block');
    configPanel.style.gridColumn = '2';
    configPanel.style.minWidth = '280px';
    if (qrColumn) qrColumn.style.gridColumn = '1';

    var node = configPanel.parentNode;
    while (node && node !== panel.parentNode) {
      if (node.style) {
        node.hidden = false;
        node.style.visibility = 'visible';
        node.style.opacity = '1';
        if (node !== panel && node.style.display === 'none') node.style.display = '';
      }
      if (node === panel) break;
      node = node.parentNode;
    }

    var hint = byId('waEvoConfigHint');
    if (!hint && configPanel.firstElementChild) {
      hint = document.createElement('div');
      hint.id = 'waEvoConfigHint';
      hint.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:11px;font-size:.75rem;color:var(--gray2);line-height:1.7;margin-bottom:12px';
      hint.innerHTML = '<strong style="color:var(--text2)">Dados necessarios:</strong> URL publica da Evolution, API Key Global e nome da instancia.';
      configPanel.insertBefore(hint, configPanel.children[1] || null);
    }

    var defaults = {
      waEvoUrl: 'https://evolution.seudominio.com.br',
      waEvoKey: 'Chave global da Evolution API',
      waEvoInst: 'r2r-crm'
    };
    Object.keys(defaults).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      makeVisible(el, '');
      if (id === 'waEvoInst') el.value = normalizeInstanceName(el.value || 'r2r-crm');
      if (!el.placeholder) el.placeholder = defaults[id];
      el.autocomplete = id === 'waEvoKey' ? 'off' : 'on';
    });

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
    ensureEvolutionConfigPanel();
    return true;
  }

  window.switchWATab = function (tab) {
    tab = ['wtc', 'evo', 'meta'].indexOf(tab) >= 0 ? tab : 'evo';
    repairWhatsappPanels();
    if (tab === 'evo') ensureEvolutionConfigPanel();
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
    if (activeTab === 'evo') ensureEvolutionConfigPanel();
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
      var saved = await saveWAConfigIfNeeded(true);
      if (!saved) return;
      var cfg = readWAConfigFromForm();
      var data = await apiFetch('/api/whatsapp/connect', { method: 'POST', body: JSON.stringify({ instance: cfg.instance }) });
      var qr = data.qr || data.qrcode || data.qrCode || data.base64 || data.data;
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

  window.salvarIA = window.saveIAConfig = async function () {
    toast('A chave de IA deve ser configurada no .env do backend em OPENAI_API_KEY. O frontend nao salva segredos.', 'info');
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
    toast('Configure N8N_WEBHOOK_URL no .env do backend. O frontend nao salva API keys de automacao.', 'info');
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
    toast('Tokens da Meta Cloud API devem ficar no backend. Configure META_ACCESS_TOKEN e dados da conta no .env.', 'info');
  };

  window.sincronizarTemplatesMeta = async function () {
    toast('Sincronizacao de templates Meta deve passar pelo backend para proteger o token.', 'info');
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

  document.addEventListener('DOMContentLoaded', async function () {
    clearFrontendSecrets();
    wireWhatsappTabs();
    setTimeout(wireWhatsappTabs, 800);
    setTimeout(function () { wireWhatsappTabs(); ensureEvolutionConfigPanel(); }, 1800);
    setTimeout(function () { wireWhatsappTabs(); ensureEvolutionConfigPanel(); }, 3600);
    await loadRuntimeConfig();
    window.R2R_BACKEND_READY = await backendReady();
    if (window.R2R_BACKEND_READY) console.log('[R2R] Backend bridge ativo');
  });
})();

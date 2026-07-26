(function () {
  'use strict';

  window.R2R_EVOLUTION_RUNTIME_FIX = '20260725-evolution-runtime-fix';

  var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  function cleanUrl(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url) && /^[A-Za-z0-9.-]+(?::\d+)?(\/|$)/.test(url)) {
      url = /^(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(url) ? 'http://' + url : 'https://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  function apiBase() {
    var stored = '';
    try { stored = localStorage.getItem('r2r_api_base') || ''; } catch (e) {}
    return cleanUrl(window.R2R_API_BASE || stored || window.location.origin);
  }

  function isBackendOrigin(origin) {
    origin = cleanUrl(origin);
    var base = apiBase();
    return !origin || origin === cleanUrl(window.location.origin) || origin === base || /\/\/api\.r2rmarketingdigital\.com\.br$/i.test(origin);
  }

  function requestOrigin(input) {
    try {
      var url = typeof input === 'string' ? input : input && input.url || '';
      if (!/^https?:\/\//i.test(url)) return '';
      return cleanUrl(new URL(url).origin);
    } catch (e) {
      return '';
    }
  }

  if (nativeFetch) {
    window.fetch = function guardedFetch(input, opts) {
      var origin = requestOrigin(input);
      var url = String(typeof input === 'string' ? input : input && input.url || '');
      var directEvolution = /\/(instance|message|chat|webhook)\//i.test(url) && !/\/api\//i.test(url);
      if (directEvolution && !isBackendOrigin(origin) && window.R2R_ALLOW_DIRECT_EVOLUTION !== true) {
        return Promise.reject(new Error('A Evolution API deve ser chamada somente pelo backend do CRM.'));
      }
      return nativeFetch(input, opts || {});
    };
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function value(ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    for (var i = 0; i < ids.length; i += 1) {
      var el = byId(ids[i]);
      if (el && typeof el.value !== 'undefined' && String(el.value).trim()) return String(el.value).trim();
    }
    return '';
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
  }

  async function token() {
    if (!window.SB && typeof window.initSupabase === 'function') await window.initSupabase();
    if (!window.SB || !window.SB.auth) return '';
    var session = await window.SB.auth.getSession();
    return session && session.data && session.data.session && session.data.session.access_token || '';
  }

  async function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var accessToken = await token();
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
    var res = await (window.r2rApiFetch || function (p, opts) {
      return fetch(apiBase() + p, opts);
    })(path, Object.assign({}, options, { headers: headers }));
    if (res && typeof res.json !== 'function') return res;
    var data = {};
    var text = '';
    try { text = await res.text(); } catch (e) {}
    try { data = text ? JSON.parse(text) : {}; } catch (e) {
      throw new Error('Backend retornou resposta invalida.');
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  }

  function readConfig() {
    return {
      url: cleanUrl(value(['waEvoUrl', 'waEvoUrl2', 'evolutionUrl', 'evolutionApiUrl'])),
      apiKey: value(['waEvoKey', 'waEvoKey2', 'evolutionApiKey']),
      instance: value(['waEvoInst', 'waEvoInstance', 'waEvoInst2', 'evolutionInstance']) || 'r2r-crm'
    };
  }

  function setFields(config) {
    config = config || {};
    ['waEvoUrl', 'waEvoUrl2', 'evolutionUrl', 'evolutionApiUrl'].forEach(function (id) {
      var el = byId(id);
      if (el && config.url) el.value = config.url;
    });
    ['waEvoInst', 'waEvoInstance', 'waEvoInst2', 'evolutionInstance'].forEach(function (id) {
      var el = byId(id);
      if (el) el.value = config.instance || config.inst || 'r2r-crm';
    });
    ['waEvoKey', 'waEvoKey2', 'evolutionApiKey'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.value = '';
        el.placeholder = config.has_api_key ? 'API Key salva no backend - preencha apenas para trocar' : 'API Key Global da Evolution';
      }
    });
    window.WA_CFG = { url: config.url || '', inst: config.instance || config.inst || 'r2r-crm', key: '' };
  }

  function qrTargets() {
    var canvas = byId('waCanvas') || byId('waQrCanvas');
    var loading = byId('waLoading') || byId('waQrLoading');
    var box = byId('waQrBox') || canvas && canvas.parentNode || loading && loading.parentNode;
    return { canvas: canvas, loading: loading, box: box };
  }

  function setQrMessage(message, color) {
    var targets = qrTargets();
    if (targets.canvas) targets.canvas.style.display = 'none';
    var html = '<span style="display:block;text-align:center;line-height:1.45;color:' + (color || '#334155') + ';padding:8px">' + String(message || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    }) + '</span>';
    if (targets.loading) {
      targets.loading.style.display = 'flex';
      targets.loading.innerHTML = html;
    } else if (targets.box) {
      targets.box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:180px;text-align:center">' + html + '</div>';
    }
  }

  function busy() {
    setQrMessage('Gerando QR Code...', '#334155');
  }

  function qrValue(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    return qrValue(payload.qr || payload.qrcode || payload.base64 || payload.code || payload.data);
  }

  function renderQr(payload) {
    var qr = String(qrValue(payload) || '').trim();
    if (!qr) return false;
    var src = qr.indexOf('data:') === 0 ? qr : 'data:image/png;base64,' + qr;
    var targets = qrTargets();
    var image = new Image();
    image.onload = function () {
      if (targets.canvas && targets.canvas.getContext) {
        targets.canvas.width = 260;
        targets.canvas.height = 260;
        targets.canvas.style.width = '260px';
        targets.canvas.style.height = '260px';
        targets.canvas.style.background = '#fff';
        var ctx = targets.canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 260, 260);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 260, 260);
        ctx.drawImage(image, 0, 0, 260, 260);
        targets.canvas.style.display = 'block';
        if (targets.loading) targets.loading.style.display = 'none';
      } else if (targets.loading) {
        targets.loading.innerHTML = '<img src="' + src + '" alt="QR Code WhatsApp" style="width:260px;height:260px;background:#fff;image-rendering:pixelated">';
      }
    };
    image.onerror = function () {
      setQrMessage('A Evolution retornou QR, mas a imagem nao pode ser renderizada.', '#b91c1c');
    };
    image.src = src;
    return true;
  }

  async function saveConfig(requireKey) {
    var cfg = readConfig();
    if (!cfg.url) {
      setQrMessage('Preencha a URL da Evolution API.', '#b91c1c');
      toast('Preencha a URL da Evolution API.', 'warn');
      return false;
    }
    if (requireKey && !cfg.apiKey) {
      setQrMessage('Preencha a API Key Global da Evolution API.', '#b91c1c');
      toast('Preencha a API Key Global da Evolution API.', 'warn');
      return false;
    }
    var payload = { url: cfg.url, instance: cfg.instance };
    if (cfg.apiKey) payload.apiKey = cfg.apiKey;
    var data = await apiFetch('/api/integrations/evolution', { method: 'POST', body: JSON.stringify(payload) });
    if (data.config) setFields(data.config);
    return true;
  }

  window.carregarWACfg = async function () {
    try {
      var data = await apiFetch('/api/integrations/evolution', { method: 'GET' });
      setFields(data.config || {});
      if (!data.configured) setQrMessage('Preencha URL, API Key e instancia da Evolution para gerar o QR Code.', '#334155');
      return data;
    } catch (error) {
      setQrMessage('Erro ao carregar configuracao: ' + error.message, '#b91c1c');
      return null;
    }
  };

  window.testarEvoAPI = async function () {
    try {
      var data = await apiFetch('/api/integrations/evolution/status', { method: 'GET' });
      toast(data.connected ? 'WhatsApp conectado.' : (data.message || 'Status WhatsApp atualizado.'), data.connected ? 'success' : 'info');
      return data;
    } catch (error) {
      toast('Erro WhatsApp: ' + error.message, 'error');
      setQrMessage('Erro ao verificar WhatsApp: ' + error.message, '#b91c1c');
      return null;
    }
  };

  window.conectarWA = window.conectarWhatsApp = async function () {
    try {
      busy();
      if (!await saveConfig(true)) return;
      var cfg = readConfig();
      var data = await apiFetch('/api/integrations/evolution/connect', {
        method: 'POST',
        body: JSON.stringify({ instance: cfg.instance })
      });
      if (renderQr(data)) return toast('QR Code gerado pelo backend.', 'success');
      if (data.pairing_code) {
        setQrMessage('Codigo de pareamento: ' + data.pairing_code, '#334155');
        return toast('A Evolution retornou codigo de pareamento.', 'info');
      }
      setQrMessage(data.message || 'A Evolution respondeu, mas nao retornou QR Code.', data.ok === false ? '#b91c1c' : '#334155');
      toast(data.message || 'Solicitacao enviada para Evolution API.', 'info');
    } catch (error) {
      setQrMessage('Erro ao conectar WhatsApp: ' + error.message, '#b91c1c');
      toast('Erro ao conectar WhatsApp: ' + error.message, 'error');
    }
  };

  window.desconectarWA = async function () {
    try {
      await apiFetch('/api/integrations/evolution/disconnect', { method: 'POST', body: JSON.stringify({}) });
      toast('Comando de desconexao enviado.', 'success');
    } catch (error) {
      toast('Erro ao desconectar: ' + error.message, 'error');
    }
  };

  window.enviarWAMsg = async function (number, text, extra) {
    number = String(number || '').replace(/\D/g, '');
    text = String(text || '').trim();
    if (!number || !text) return null;
    return apiFetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ number: number, text: text }, extra || {}))
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (typeof window.carregarWACfg === 'function') window.carregarWACfg();
    }, 1000);
  });
})();

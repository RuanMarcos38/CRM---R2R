(function () {
  'use strict';

  var VERSION = '20260804-direct-crm-final';
  if (window.R2R_EVOLUTION_RUNTIME_FIX === VERSION) return;
  window.R2R_EVOLUTION_RUNTIME_FIX = VERSION;

  var pollTimer = null;
  var pollAttempts = 0;
  var maxPollAttempts = 120;
  var lastConnected = false;
  var busy = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function cleanUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function apiBase() {
    var configured = cleanUrl(
      window.R2R_API_BASE ||
      (window.R2R_CONFIG && window.R2R_CONFIG.API_BASE_URL) ||
      ''
    );

    if (configured) return configured;

    try {
      var stored = cleanUrl(localStorage.getItem('r2r_api_base') || '');
      if (stored) return stored;
    } catch (error) {}

    return cleanUrl(window.location.origin);
  }

  async function accessToken() {
    try {
      if (!window.SB && typeof window.initSupabase === 'function') {
        await window.initSupabase();
      }

      if (!window.SB || !window.SB.auth) return '';

      var result = await window.SB.auth.getSession();
      return (
        result &&
        result.data &&
        result.data.session &&
        result.data.session.access_token
      ) || '';
    } catch (error) {
      return '';
    }
  }

  async function api(path, options) {
    options = options || {};

    var headers = Object.assign(
      {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      options.headers || {}
    );

    var token = await accessToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    var response = await fetch(apiBase() + path, Object.assign({}, options, {
      headers: headers,
      credentials: 'include',
      cache: 'no-store'
    }));

    var raw = '';
    try {
      raw = await response.text();
    } catch (error) {}

    var data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error(
          'O backend retornou uma resposta inválida. HTTP ' +
          response.status +
          ': ' +
          raw.slice(0, 180)
        );
      }
    }

    if (!response.ok || data.ok === false || data.success === false) {
      throw new Error(
        data.error ||
        data.message ||
        ('Falha na API. HTTP ' + response.status)
      );
    }

    return data;
  }

  function instanceName() {
    var ids = [
      'waEvoInst',
      'waEvoInstance',
      'waEvoInst2',
      'evolutionInstance'
    ];

    for (var i = 0; i < ids.length; i += 1) {
      var field = byId(ids[i]);
      if (field && String(field.value || '').trim()) {
        return String(field.value).trim();
      }
    }

    return 'ruan';
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    }
  }

  function setStatus(kind, text) {
    var statusText = byId('waStatusTxt');
    if (statusText) statusText.textContent = text;

    var dot =
      byId('waStatusDot') ||
      document.querySelector('.wa-status-dot');

    if (dot) {
      dot.style.background =
        kind === 'on' ? '#22c55e' :
        kind === 'off' ? '#ef4444' :
        '#f97316';
    }
  }

  function qrBox() {
    return (
      byId('waQrBox') ||
      byId('waCanvas') && byId('waCanvas').parentNode ||
      byId('waQrCanvas') && byId('waQrCanvas').parentNode ||
      byId('waLoading') && byId('waLoading').parentNode
    );
  }

  function normalizeStatus(data) {
    data = data || {};

    var nested = data.data || {};
    var status = String(
      data.status ||
      data.connectionStatus ||
      nested.status ||
      nested.connectionStatus ||
      nested.state ||
      ''
    ).toLowerCase();

    var connected =
      data.connected === true ||
      nested.connected === true ||
      status === 'open' ||
      status === 'connected';

    return {
      connected: connected,
      status: status
    };
  }

  function qrImage(data) {
    if (!data) return '';

    var candidates = [
      data.qrCode,
      data.qrcode,
      data.qr,
      data.base64,
      data.image,
      data.data && data.data.qrCode,
      data.data && data.data.qrcode,
      data.data && data.data.qr,
      data.data && data.data.base64,
      data.raw && data.raw.base64
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || '').trim();
      if (!value) continue;

      if (value.indexOf('data:image/') === 0) return value;

      if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 500) {
        return 'data:image/png;base64,' + value.replace(/\s+/g, '');
      }
    }

    return '';
  }

  function renderQr(src) {
    var box = qrBox();
    if (!box || !src) return false;

    lastConnected = false;

    box.innerHTML = '';
    box.style.width = '230px';
    box.style.height = '230px';
    box.style.maxWidth = '230px';
    box.style.padding = '14px';
    box.style.background = '#ffffff';
    box.style.borderRadius = '10px';
    box.style.overflow = 'hidden';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';

    var img = document.createElement('img');
    img.src = src;
    img.alt = 'QR Code para conectar o WhatsApp';
    img.width = 202;
    img.height = 202;
    img.draggable = false;
    img.style.width = '202px';
    img.style.height = '202px';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.background = '#ffffff';
    img.style.imageRendering = 'pixelated';

    img.onerror = function () {
      setMessage(
        'O QR Code foi recebido, mas a imagem não pôde ser exibida.',
        '#b91c1c'
      );
    };

    box.appendChild(img);
    setStatus('ing', 'Escaneie o QR Code no WhatsApp');
    return true;
  }

  function setMessage(message, color) {
    var box = qrBox();
    if (!box) return;

    box.innerHTML =
      '<div style="' +
      'width:100%;height:100%;min-height:190px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'text-align:center;padding:18px;background:#fff;' +
      'color:' + (color || '#334155') + ';line-height:1.45">' +
      String(message || '').replace(/[&<>"']/g, function (char) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char];
      }) +
      '</div>';
  }

  function connectedUi(showToastMessage) {
    lastConnected = true;
    stopPolling();
    setStatus('on', 'Conectado ✓');

    var box = qrBox();
    if (box) {
      box.innerHTML =
        '<div data-r2r-wa-connected="true" style="' +
        'width:100%;height:100%;min-height:200px;' +
        'display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:10px;background:#fff;' +
        'color:#16a34a;text-align:center;padding:20px">' +
        '<span style="font-size:52px;line-height:1">✓</span>' +
        '<strong>WhatsApp conectado</strong>' +
        '<small style="color:#64748b">Instância: ' +
        instanceName().replace(/[<>&"]/g, '') +
        '</small>' +
        '</div>';
    }

    var connectButton = byId('waBtnOn') || byId('waBtnConnect');
    var disconnectButton = byId('waBtnOff') || byId('waBtnDisconnect');

    if (connectButton) connectButton.style.display = 'none';
    if (disconnectButton) disconnectButton.style.display = '';

    if (showToastMessage) {
      toast('WhatsApp conectado com sucesso.', 'success');
    }
  }

  function disconnectedUi(message) {
    lastConnected = false;
    setStatus('off', message || 'Desconectado');

    var connectButton = byId('waBtnOn') || byId('waBtnConnect');
    var disconnectButton = byId('waBtnOff') || byId('waBtnDisconnect');

    if (connectButton) connectButton.style.display = '';
    if (disconnectButton) disconnectButton.style.display = 'none';
  }

  async function checkStatus(showToastMessage) {
    var data = await api('/api/whatsapp/status', {
      method: 'GET'
    });

    var state = normalizeStatus(data);

    if (state.connected) {
      connectedUi(showToastMessage === true);
      return data;
    }

    lastConnected = false;

    var image = qrImage(data);
    if (image) renderQr(image);

    if (
      state.status === 'close' ||
      state.status === 'closed' ||
      state.status === 'disconnected'
    ) {
      disconnectedUi('Desconectado');
    } else if (!image) {
      setStatus('ing', 'Configurado, aguardando conexão');
    }

    return data;
  }

  async function connect() {
    if (busy) return;
    busy = true;

    try {
      stopPolling();
      lastConnected = false;
      setStatus('ing', 'Gerando QR Code...');
      setMessage('Gerando um novo QR Code...', '#334155');

      /*
       * O CRM chama somente o próprio backend.
       * URL e API Key da Evolution permanecem protegidas no EasyPanel.
       */
      var data = await api('/api/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({
          instance: instanceName(),
          forceNewQr: true
        })
      });

      var state = normalizeStatus(data);

      if (state.connected) {
        connectedUi(true);
        return data;
      }

      var image = qrImage(data);

      if (image) {
        renderQr(image);
        toast('QR Code novo gerado. Escaneie pelo WhatsApp.', 'success');
      } else {
        await checkStatus(false);
      }

      startPolling();
      return data;
    } catch (error) {
      disconnectedUi('Erro ao gerar QR Code');
      setMessage(
        'Erro ao conectar diretamente pelo CRM: ' + error.message,
        '#b91c1c'
      );
      toast('Erro ao conectar WhatsApp: ' + error.message, 'error');
      throw error;
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    if (busy) return;
    busy = true;

    try {
      stopPolling();

      await api('/api/whatsapp/disconnect', {
        method: 'POST',
        body: JSON.stringify({
          instance: instanceName()
        })
      });

      disconnectedUi('Desconectado');
      setMessage(
        'WhatsApp desconectado. Clique em Conectar para gerar um novo QR Code.',
        '#334155'
      );
      toast('WhatsApp desconectado.', 'info');
    } catch (error) {
      toast('Erro ao desconectar: ' + error.message, 'error');
      throw error;
    } finally {
      busy = false;
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    pollAttempts = 0;
    window._wa_direct_crm_timer = null;
  }

  function startPolling() {
    stopPolling();

    pollTimer = setInterval(function () {
      pollAttempts += 1;

      checkStatus(false).catch(function (error) {
        console.warn('[R2R WhatsApp polling]', error);
      });

      if (pollAttempts >= maxPollAttempts) {
        stopPolling();

        if (!lastConnected) {
          setStatus('ing', 'QR Code expirou. Clique em Conectar novamente');
        }
      }
    }, 3000);

    window._wa_direct_crm_timer = pollTimer;
  }

  window.carregarWACfg = async function () {
    try {
      return await checkStatus(false);
    } catch (error) {
      console.warn('[R2R WhatsApp inicialização]', error);
      return null;
    }
  };

  window.checkWAStatus = function () {
    return checkStatus(true);
  };

  window.testarEvoAPI = function () {
    return checkStatus(true);
  };

  window.conectarWA = connect;
  window.conectarWhatsApp = connect;
  window.desconectarWA = disconnect;
  window.desconectarWhatsApp = disconnect;
  window.marcarWAConectado = connectedUi;

  function initialCheck() {
    setTimeout(function () {
      checkStatus(false).catch(function () {});
    }, 800);

    setTimeout(function () {
      checkStatus(false).catch(function () {});
    }, 2200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialCheck);
  } else {
    initialCheck();
  }

  console.log('[R2R] WhatsApp direto pelo CRM carregado:', VERSION);
})();
const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function replaceOnce(file, from, to, label) {
  const before = read(file);
  if (before.includes(to)) return false;
  if (!before.includes(from)) throw new Error(`Nao encontrei bloco para patch: ${label}`);
  write(file, before.replace(from, to));
  console.log(`patched ${label}`);
  return true;
}

function insertBefore(file, marker, insertion, label) {
  const before = read(file);
  if (before.includes(insertion.trim().split('\n')[0])) return false;
  if (!before.includes(marker)) throw new Error(`Nao encontrei marcador para patch: ${label}`);
  write(file, before.replace(marker, insertion + '\n' + marker));
  console.log(`patched ${label}`);
  return true;
}

function patchHttp() {
  replaceOnce(
    'backend-node/src/http.js',
    "  return numberEnv('JSON_BODY_LIMIT_BYTES', 2_000_000);",
    "  return numberEnv('JSON_BODY_LIMIT_BYTES', 15_000_000);",
    'JSON body limit'
  );
}

function patchServer() {
  const server = 'backend-node/server.js';
  let src = read(server);

  if (!src.includes("'video/mp4'")) {
    src = src.replace(
      "    'image/webp',\n    'application/pdf',",
      "    'image/webp',\n    'video/mp4',\n    'audio/mpeg',\n    'audio/ogg',\n    'audio/webm',\n    'application/pdf',\n    'application/msword',\n    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',"
    );
  }

  const oldSend = `  if ((url.pathname === '/api/whatsapp/send' || url.pathname === '/api/messages/send') && req.method === 'POST') {\n    await assertFeatureEnabled(store, ctx, 'whatsapp');\n    const body = await readBody(req);\n    const text = String(body.text || body.message || '').trim();\n    const number = String(body.number || body.telefone || body.phone || '').replace(/\\D/g, '');\n    if (!number || !text) return sendJson(req, res, 400, { ok: false, success: false, error: 'Informe number/telefone e text/message.' });\n    const cfg = await getWhatsappConfig(ctx);\n    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');\n    const result = await evolutionRequestWithFallback(ctx, \`/message/sendText/\${instance}\`, 'POST', {\n      number,\n      textMessage: { text }\n    }, cfg);\n    await audit(ctx, 'whatsapp_send', 'mensagens', null, { number, status: result.status });\n    return sendJson(req, res, 200, result);\n  }`;

  const newSend = `  if ((url.pathname === '/api/whatsapp/send' || url.pathname === '/api/messages/send') && req.method === 'POST') {\n    await assertFeatureEnabled(store, ctx, 'whatsapp');\n    const body = await readBody(req);\n    const text = String(body.text || body.message || '').trim();\n    const number = String(body.number || body.telefone || body.phone || '').replace(/\\D/g, '');\n    if (!number || !text) return sendJson(req, res, 400, { ok: false, success: false, error: 'Informe number/telefone e text/message.' });\n    const cfg = await getWhatsappConfig(ctx);\n    const instance = encodeURIComponent(body.instance || cfg.instance || 'r2r-crm');\n    const result = await evolutionRequestWithFallback(ctx, \`/message/sendText/\${instance}\`, 'POST', {\n      number,\n      textMessage: { text }\n    }, cfg);\n    let messageRow = null;\n    let conversationUpdated = false;\n    const conversaId = String(body.conversa_id || body.conversation_id || '').trim();\n    if (conversaId) {\n      const sentAt = new Date().toISOString();\n      const deliveryStatus = result.configured === false ? 'not_configured' : (result.ok && result.success !== false ? 'sent' : 'failed');\n      messageRow = await store.insert('mensagens', {\n        conversa_id: conversaId,\n        lead_id: body.lead_id || null,\n        cliente_id: body.cliente_id || body.client_id || null,\n        usuario_id: ctx.profile && ctx.profile.id || null,\n        direcao: 'outbound',\n        canal: 'whatsapp',\n        tipo: 'text',\n        texto: text,\n        status: deliveryStatus,\n        metadata: {\n          number,\n          backend_route: url.pathname,\n          integration_status: result.status || null,\n          configured: result.configured !== false\n        }\n      }, ctx, RESOURCES.mensagens).catch(error => {\n        console.warn('[whatsapp_send] mensagem nao persistida:', error.message);\n        return null;\n      });\n      await store.update('conversas', conversaId, {\n        ultima_mensagem: text.slice(0, 160),\n        ultima_mensagem_em: sentAt\n      }, ctx, RESOURCES.conversas).then(() => {\n        conversationUpdated = true;\n      }).catch(error => {\n        console.warn('[whatsapp_send] conversa nao atualizada:', error.message);\n      });\n    }\n    await audit(ctx, 'whatsapp_send', 'mensagens', null, { number, status: result.status });\n    return sendJson(req, res, 200, {\n      ...result,\n      crm: {\n        message_saved: !!messageRow,\n        conversation_updated: conversationUpdated,\n        mensagem_id: messageRow && messageRow.id || null,\n        conversa_id: conversaId || null\n      }\n    });\n  }`;

  if (!src.includes('const conversaId = String(body.conversa_id')) {
    if (!src.includes(oldSend)) throw new Error('Bloco antigo /api/messages/send nao encontrado.');
    src = src.replace(oldSend, newSend);
  }

  if (!src.includes("url.pathname === '/api/meta/test'")) {
    const metaStatus = `  if (url.pathname === '/api/meta/status' && req.method === 'GET') {\n    await assertFeatureEnabled(store, ctx, 'meta_ads');\n    const meta = await getIntegrationConfig(ctx, 'meta');\n    const result = await metaRequest('/me?fields=id,name', meta.config);\n    return sendJson(req, res, 200, result);\n  }`;
    const metaTest = `${metaStatus}\n\n  if (url.pathname === '/api/meta/test' && req.method === 'POST') {\n    await assertFeatureEnabled(store, ctx, 'meta_ads');\n    if (!isCompanyAdmin(ctx)) return sendJson(req, res, 403, { ok: false, error: 'Somente Administrador da Empresa pode testar Meta Ads.' });\n    const body = await readBody(req);\n    const token = firstText(body.token, body.accessToken, body.access_token, body.apiKey, body.api_key);\n    if (!token) return sendJson(req, res, 400, { ok: false, error: 'Informe o token da Meta para testar.' });\n    const result = await metaRequest('/me?fields=id,name', { ...body, token, accessToken: token, __disableEnv: true });\n    return sendJson(req, res, 200, result);\n  }`;
    if (!src.includes(metaStatus)) throw new Error('Bloco /api/meta/status nao encontrado.');
    src = src.replace(metaStatus, metaTest);
  }

  write(server, src);
  console.log('patched backend-node/server.js');
}

function patchBridge() {
  const bridge = 'frontend-public_html/assets/crm-saas-bridge.js';
  let src = read(bridge);
  src = src.replace(/window\.R2R_BRIDGE_VERSION = '[^']+';/, "window.R2R_BRIDGE_VERSION = '20260707-safe-backend-actions';");

  if (!src.includes('function activeConversation()')) {
    const marker = '  function qrElements() {';
    const helpers = `  function activeConversation() {\n    var conv = window.CONV_ATIVA || null;\n    if (conv && typeof conv === 'object') return conv;\n    var id = window.CONV_ATIVA_ID || window.convAtivaId || '';\n    var list = window._conversas || window.conversas || [];\n    if (id && Array.isArray(list)) {\n      for (var i = 0; i < list.length; i += 1) {\n        if (String(list[i] && list[i].id || '') === String(id)) return list[i];\n      }\n    }\n    return conv && typeof conv === 'string' ? { id: conv } : null;\n  }\n\n  function phoneFromConversation(conv) {\n    conv = conv || {};\n    return String(conv.wa_contact_id || conv.telefone || conv.phone || conv.numero || conv.lead_telefone || conv.cliente_telefone || '').replace(/\\D/g, '');\n  }\n\n  function fileToDataUrl(file) {\n    return new Promise(function (resolve, reject) {\n      var reader = new FileReader();\n      reader.onload = function () { resolve(String(reader.result || '')); };\n      reader.onerror = function () { reject(reader.error || new Error('Nao foi possivel ler o arquivo.')); };\n      reader.readAsDataURL(file);\n    });\n  }\n\n`;
    if (!src.includes(marker)) throw new Error('Marcador de helpers do bridge nao encontrado.');
    src = src.replace(marker, helpers + marker);
  }

  if (!src.includes("window.anexarArquivo = function ()")) {
    const marker = '  window.gerarRelatorio = async function () {';
    const overrides = `  window.enviarWAMsg = async function (numero, texto, extra) {\n    numero = String(numero || '').replace(/\\D/g, '');\n    texto = String(texto || '').trim();\n    if (!numero || !texto) return null;\n    return apiFetch('/api/whatsapp/send', {\n      method: 'POST',\n      body: JSON.stringify(Object.assign({ number: numero, text: texto }, extra || {}))\n    });\n  };\n\n  window.sendMsg = async function () {\n    var inp = byId('chatInput');\n    var txt = inp && inp.value && inp.value.trim();\n    if (!txt) return false;\n    var conv = activeConversation();\n    if (!conv || !conv.id) return toast('Selecione uma conversa.', 'warn'), false;\n    var number = phoneFromConversation(conv);\n    if (!number) return toast('Conversa sem telefone WhatsApp.', 'warn'), false;\n    if (inp) inp.value = '';\n    try {\n      var data = await window.enviarWAMsg(number, txt, { conversa_id: conv.id, lead_id: conv.lead_id || null, cliente_id: conv.cliente_id || null });\n      if (data && data.configured === false) {\n        if (inp) inp.value = txt;\n        toast(data.message || 'WhatsApp nao configurado no backend.', 'warn');\n        return false;\n      }\n      if (typeof window.appendChatMsg === 'function') window.appendChatMsg(txt, true, new Date().toISOString());\n      conv.ultima_mensagem = txt.slice(0, 160);\n      conv.ultima_mensagem_em = new Date().toISOString();\n      if (typeof window.renderConvList === 'function') window.renderConvList();\n      return true;\n    } catch (error) {\n      if (inp) inp.value = txt;\n      toast('Erro ao enviar WhatsApp: ' + error.message, 'error');\n      return false;\n    }\n  };\n  window.sendMessage = window.sendMsg;\n\n  window.anexarArquivo = function () {\n    var inp = document.createElement('input');\n    inp.type = 'file';\n    inp.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv';\n    inp.onchange = async function () {\n      var file = inp.files && inp.files[0];\n      if (!file) return;\n      var conv = activeConversation();\n      if (!conv || !conv.id) return toast('Selecione uma conversa.', 'warn');\n      try {\n        toast('Enviando arquivo para o backend...', 'info');\n        var dataUrl = await fileToDataUrl(file);\n        var upload = await apiFetch('/api/files/upload', {\n          method: 'POST',\n          body: JSON.stringify({ name: file.name, mime_type: file.type || 'application/octet-stream', content_base64: dataUrl, lead_id: conv.lead_id || null, cliente_id: conv.cliente_id || null })\n        });\n        var fileRow = upload && upload.data || {};\n        var downloadUrl = fileRow.id ? '/api/files/' + encodeURIComponent(fileRow.id) + '/download' : '';\n        await apiFetch('/api/mensagens', {\n          method: 'POST',\n          body: JSON.stringify({ conversa_id: conv.id, lead_id: conv.lead_id || null, cliente_id: conv.cliente_id || null, direcao: 'outbound', canal: 'whatsapp', tipo: 'file', texto: 'Arquivo: ' + file.name, anexo_url: downloadUrl, status: 'saved' })\n        }).catch(function () { return null; });\n        await apiFetch('/api/conversas/' + encodeURIComponent(conv.id), { method: 'PATCH', body: JSON.stringify({ ultima_mensagem: 'Arquivo: ' + file.name, ultima_mensagem_em: new Date().toISOString() }) }).catch(function () { return null; });\n        if (typeof window.appendChatMsg === 'function') window.appendChatMsg('Arquivo salvo: ' + file.name, true, new Date().toISOString());\n        toast('Arquivo salvo no CRM. Envio de midia pelo WhatsApp deve ser feito por rota segura no backend.', 'success');\n      } catch (error) {\n        toast('Erro ao anexar arquivo: ' + error.message, 'error');\n      }\n    };\n    inp.click();\n  };\n\n  window.testarConexaoMeta = async function () {\n    var token = inputValue(['metaToken', 'waMetaToken']);\n    var res = byId('metaConTestResult') || byId('metaTestResult');\n    if (res) { res.style.display = 'block'; res.style.color = 'var(--gray2)'; res.textContent = 'Testando pelo backend...'; }\n    try {\n      var data = token ? await apiFetch('/api/meta/test', { method: 'POST', body: JSON.stringify({ token: token }) }) : await apiFetch('/api/meta/status', { method: 'GET' });\n      var ok = data.configured !== false && data.ok !== false;\n      if (res) { res.style.color = ok ? '#86efac' : '#fca5a5'; res.textContent = ok ? 'Meta conectada pelo backend.' : (data.message || data.error || 'Meta nao configurada.'); }\n      toast(ok ? 'Meta conectada pelo backend.' : (data.message || 'Meta nao configurada.'), ok ? 'success' : 'warn');\n      return data;\n    } catch (error) {\n      if (res) { res.style.color = '#fca5a5'; res.textContent = error.message; }\n      toast('Erro Meta: ' + error.message, 'error');\n      return null;\n    }\n  };\n  window.testarMetaWA = window.testarConexaoMeta;\n\n  window.abrirModalMetaAds = function () {\n    var cfg = window.META_CFG || {};\n    if (typeof window.openModal !== 'function') return toast('Modal indisponivel. Abra Ajustes > WhatsApp/Meta.', 'warn');\n    window.openModal('Conectar Meta Business',\n      '<div style="margin-bottom:12px;padding:10px;background:rgba(24,107,255,.08);border:1px solid rgba(24,107,255,.2);border-radius:8px;font-size:.8rem;color:#93c5fd;line-height:1.7"><strong>Credenciais seguras:</strong><br>O token sera enviado somente para o backend e nao ficara salvo no navegador.</div>'\n      + '<div class="form-group"><label>Access Token</label><input type="password" id="metaToken" placeholder="Cole o token apenas para salvar ou testar" class="form-input" autocomplete="off"></div>'\n      + '<div class="form-row"><div class="form-group"><label>Ad Account ID</label><input type="text" id="metaActId" placeholder="act_123456789" class="form-input" value="' + escapeHtml(cfg.actId || cfg.adAccountId || '') + '"></div>'\n      + '<div class="form-group"><label>Business ID</label><input type="text" id="metaBizId" placeholder="987654321" class="form-input" value="' + escapeHtml(cfg.bizId || cfg.businessId || '') + '"></div></div>'\n      + '<div id="metaConTestResult" style="display:none;margin:10px 0;padding:9px 12px;border-radius:7px;font-size:.79rem"></div>'\n      + '<button onclick="testarConexaoMeta()" style="padding:7px 14px;background:transparent;border:1px solid var(--border2);border-radius:7px;color:var(--gray2);cursor:pointer;font-family:inherit;font-size:.79rem;margin-top:4px">Testar conexao</button>',\n      async function () {\n        var token = inputValue('metaToken');\n        var actId = inputValue('metaActId');\n        var bizId = inputValue('metaBizId');\n        if (!token && !actId && !bizId) return toast('Informe token, Ad Account ID ou Business ID.', 'warn');\n        try {\n          await saveIntegration('meta', { token: token, accessToken: token, adAccountId: actId, businessId: bizId, active: true });\n          window.META_CFG = { actId: actId, bizId: bizId, ativa: true, token: '' };\n          try { localStorage.setItem('r2r_meta_ads', JSON.stringify(window.META_CFG)); } catch (e) {}\n          toast('Meta Ads salva com seguranca no backend.', 'success');\n          if (typeof window.closeModal === 'function') window.closeModal();\n          if (typeof window.carregarMetaAdsCampanhas === 'function') window.carregarMetaAdsCampanhas();\n        } catch (error) {\n          toast('Erro ao salvar Meta Ads: ' + error.message, 'error');\n        }\n      });\n  };\n\n`;
    if (!src.includes(marker)) throw new Error('Marcador de overrides do bridge nao encontrado.');
    src = src.replace(marker, overrides + marker);
  }

  write(bridge, src);
  console.log('patched crm-saas-bridge.js');
}

function main() {
  patchHttp();
  patchServer();
  patchBridge();
  console.log('R2R hotfix 20260707 aplicado.');
}

main();

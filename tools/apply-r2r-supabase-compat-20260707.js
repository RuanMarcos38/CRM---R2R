const fs = require('fs');
const file = 'backend-node/server.js';
let src = fs.readFileSync(file, 'utf8');

function mustReplace(from, to, label) {
  if (src.includes(to)) return;
  if (!src.includes(from)) throw new Error(`Nao encontrei bloco: ${label}`);
  src = src.replace(from, to);
  console.log(`patched ${label}`);
}

if (!src.includes('async function insertWithFallback(')) {
  const marker = `function firstText(...values) {`;
  const helpers = `async function insertWithFallback(table, primaryPayload, fallbackPayload, ctx, resource, label) {\n  try {\n    return await store.insert(table, primaryPayload, ctx, resource);\n  } catch (error) {\n    if (!fallbackPayload) throw error;\n    console.warn(\`[compat] \${label || table}: tentando payload legado (\${error.message})\`);\n    return store.insert(table, fallbackPayload, ctx, resource);\n  }\n}\n\nasync function updateWithFallback(table, id, primaryPayload, fallbackPayload, ctx, resource, label) {\n  try {\n    return await store.update(table, id, primaryPayload, ctx, resource);\n  } catch (error) {\n    if (!fallbackPayload) throw error;\n    console.warn(\`[compat] \${label || table}: tentando update legado (\${error.message})\`);\n    return store.update(table, id, fallbackPayload, ctx, resource);\n  }\n}\n\n`;
  if (!src.includes(marker)) throw new Error('Marcador firstText nao encontrado.');
  src = src.replace(marker, helpers + marker);
}

mustReplace(
`    const row = await store.insert('arquivos', {\n      nome: originalName,\n      path: relativePath,\n      mime_type: mimeType,\n      size_bytes: upload.buffer.length,\n      lead_id: body.lead_id || null,\n      cliente_id: body.cliente_id || body.client_id || null,\n      oportunidade_id: body.oportunidade_id || null,\n      uploaded_by: ctx.profile && ctx.profile.id || null\n    }, ctx, RESOURCES.arquivos);`,
`    const row = await insertWithFallback('arquivos', {\n      nome: originalName,\n      path: relativePath,\n      mime_type: mimeType,\n      size_bytes: upload.buffer.length,\n      lead_id: body.lead_id || null,\n      cliente_id: body.cliente_id || body.client_id || null,\n      oportunidade_id: body.oportunidade_id || null,\n      uploaded_by: ctx.profile && ctx.profile.id || null\n    }, {\n      nome: originalName,\n      url: relativePath,\n      tipo: mimeType,\n      tamanho: upload.buffer.length,\n      lead_id: body.lead_id || null,\n      cliente_id: body.cliente_id || body.client_id || null,\n      conversa_id: body.conversa_id || body.conversation_id || null,\n      uploaded_by: ctx.profile && ctx.profile.id || null\n    }, ctx, RESOURCES.arquivos, 'file_upload');`,
'arquivos insert fallback'
);

src = src.replace("row.path || ''", "row.path || row.url || ''");

mustReplace(
`        conversa = await store.insert('conversas', {\n          canal: 'whatsapp',\n          wa_contact_id: parsed.number || parsed.remoteJid,\n          external_id: parsed.remoteJid,\n          status: 'aberta',\n          ultima_mensagem: parsed.text || \`[\${parsed.event}]\`,\n          ultima_mensagem_em: new Date().toISOString(),\n          nao_lidas: parsed.fromMe ? 0 : 1,\n          metadata: { instance: parsed.instance, push_name: parsed.pushName }\n        }, ctx, RESOURCES.conversas);`,
`        conversa = await insertWithFallback('conversas', {\n          canal: 'whatsapp',\n          wa_contact_id: parsed.number || parsed.remoteJid,\n          external_id: parsed.remoteJid,\n          status: 'aberta',\n          ultima_mensagem: parsed.text || \`[\${parsed.event}]\`,\n          ultima_mensagem_em: new Date().toISOString(),\n          nao_lidas: parsed.fromMe ? 0 : 1,\n          metadata: { instance: parsed.instance, push_name: parsed.pushName }\n        }, {\n          canal: 'whatsapp',\n          wa_contact_id: parsed.number || parsed.remoteJid,\n          wa_thread_id: parsed.remoteJid,\n          status: 'aberta',\n          ultima_mensagem: parsed.text || \`[\${parsed.event}]\`,\n          nao_lidas: parsed.fromMe ? 0 : 1,\n          metadata: { instance: parsed.instance, push_name: parsed.pushName, remote_jid: parsed.remoteJid }\n        }, ctx, RESOURCES.conversas, 'evolution_conversa');`,
'evolution conversa fallback'
);

mustReplace(
`      const mensagem = await store.insert('mensagens', {\n        conversa_id: conversa.id,\n        direcao: parsed.fromMe ? 'outbound' : 'inbound',\n        canal: 'whatsapp',\n        tipo: parsed.text ? 'text' : parsed.event,\n        texto: parsed.text || '',\n        external_id: parsed.externalId || null,\n        status: parsed.fromMe ? 'sent' : 'received',\n        metadata: {\n          instance: parsed.instance,\n          remote_jid: parsed.remoteJid,\n          push_name: parsed.pushName,\n          timestamp: parsed.timestamp,\n          event: parsed.event\n        }\n      }, ctx, RESOURCES.mensagens);`,
`      const mensagem = await insertWithFallback('mensagens', {\n        conversa_id: conversa.id,\n        direcao: parsed.fromMe ? 'outbound' : 'inbound',\n        canal: 'whatsapp',\n        tipo: parsed.text ? 'text' : parsed.event,\n        texto: parsed.text || '',\n        external_id: parsed.externalId || null,\n        status: parsed.fromMe ? 'sent' : 'received',\n        metadata: {\n          instance: parsed.instance,\n          remote_jid: parsed.remoteJid,\n          push_name: parsed.pushName,\n          timestamp: parsed.timestamp,\n          event: parsed.event\n        }\n      }, {\n        conversa_id: conversa.id,\n        autor_id: null,\n        direcao: parsed.fromMe ? 'outbound' : 'inbound',\n        tipo: parsed.text ? 'texto' : parsed.event,\n        conteudo: parsed.text || '',\n        lida: !!parsed.fromMe,\n        wa_message_id: parsed.externalId || null,\n        wa_msg_id: parsed.externalId || null,\n        external_id: parsed.externalId || null,\n        status_wa: parsed.fromMe ? 'sent' : 'received',\n        tipo_autor: parsed.fromMe ? 'usuario' : 'contato',\n        metadata: {\n          instance: parsed.instance,\n          remote_jid: parsed.remoteJid,\n          push_name: parsed.pushName,\n          timestamp: parsed.timestamp,\n          event: parsed.event\n        }\n      }, ctx, RESOURCES.mensagens, 'evolution_mensagem');`,
'evolution mensagem fallback'
);

mustReplace(
`      await store.update('conversas', conversa.id, {\n        ultima_mensagem: parsed.text || conversa.ultima_mensagem || \`[\${parsed.event}]\`,\n        ultima_mensagem_em: new Date().toISOString(),\n        nao_lidas: parsed.fromMe ? Number(conversa.nao_lidas || 0) : Number(conversa.nao_lidas || 0) + 1\n      }, ctx, RESOURCES.conversas).catch(() => null);`,
`      await updateWithFallback('conversas', conversa.id, {\n        ultima_mensagem: parsed.text || conversa.ultima_mensagem || \`[\${parsed.event}]\`,\n        ultima_mensagem_em: new Date().toISOString(),\n        nao_lidas: parsed.fromMe ? Number(conversa.nao_lidas || 0) : Number(conversa.nao_lidas || 0) + 1\n      }, {\n        ultima_mensagem: parsed.text || conversa.ultima_mensagem || \`[\${parsed.event}]\`,\n        nao_lidas: parsed.fromMe ? Number(conversa.nao_lidas || 0) : Number(conversa.nao_lidas || 0) + 1\n      }, ctx, RESOURCES.conversas, 'evolution_conversa_update').catch(() => null);`,
'evolution conversa update fallback'
);

mustReplace(
`      messageRow = await store.insert('mensagens', {\n        conversa_id: conversaId,\n        lead_id: body.lead_id || null,\n        cliente_id: body.cliente_id || body.client_id || null,\n        usuario_id: ctx.profile && ctx.profile.id || null,\n        direcao: 'outbound',\n        canal: 'whatsapp',\n        tipo: 'text',\n        texto: text,\n        status: deliveryStatus,\n        metadata: {\n          number,\n          backend_route: url.pathname,\n          integration_status: result.status || null,\n          configured: result.configured !== false\n        }\n      }, ctx, RESOURCES.mensagens).catch(error => {`,
`      messageRow = await insertWithFallback('mensagens', {\n        conversa_id: conversaId,\n        lead_id: body.lead_id || null,\n        cliente_id: body.cliente_id || body.client_id || null,\n        usuario_id: ctx.profile && ctx.profile.id || null,\n        direcao: 'outbound',\n        canal: 'whatsapp',\n        tipo: 'text',\n        texto: text,\n        status: deliveryStatus,\n        metadata: {\n          number,\n          backend_route: url.pathname,\n          integration_status: result.status || null,\n          configured: result.configured !== false\n        }\n      }, {\n        conversa_id: conversaId,\n        autor_id: ctx.profile && ctx.profile.id || null,\n        direcao: 'outbound',\n        tipo: 'texto',\n        conteudo: text,\n        lida: true,\n        status_wa: deliveryStatus,\n        tipo_autor: 'usuario',\n        metadata: {\n          number,\n          backend_route: url.pathname,\n          integration_status: result.status || null,\n          configured: result.configured !== false\n        }\n      }, ctx, RESOURCES.mensagens, 'whatsapp_send_mensagem').catch(error => {`,
'whatsapp send mensagem fallback'
);

mustReplace(
`      await store.update('conversas', conversaId, {\n        ultima_mensagem: text.slice(0, 160),\n        ultima_mensagem_em: sentAt\n      }, ctx, RESOURCES.conversas).then(() => {`,
`      await updateWithFallback('conversas', conversaId, {\n        ultima_mensagem: text.slice(0, 160),\n        ultima_mensagem_em: sentAt\n      }, {\n        ultima_mensagem: text.slice(0, 160)\n      }, ctx, RESOURCES.conversas, 'whatsapp_send_conversa').then(() => {`,
'whatsapp send conversa fallback'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Supabase compatibility hotfix applied.');

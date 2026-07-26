#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const RUNTIME_PATCH_VERSION = '20260726-whatsapp-connected-qr';
const originalReadFileSync = fs.readFileSync.bind(fs);

fs.readFileSync = function patchedReadFileSync(filePath, options) {
  const content = originalReadFileSync(filePath, options);
  const fileName = String(filePath || '');
  const encoding = typeof options === 'string' ? options : options && options.encoding;
  if (!encoding || !fileName.endsWith(`${path.sep}index.html`)) return content;

  let html = String(content);
  html = html.replace(
    /assets\/crm-saas-bridge\.js\?v=[^"']+/g,
    `assets/crm-saas-bridge.js?v=${RUNTIME_PATCH_VERSION}`
  );

  const patchTag = `<script src="assets/r2r-evolution-runtime-fix.js?v=${RUNTIME_PATCH_VERSION}"></script>`;
  if (!html.includes('r2r-evolution-runtime-fix.js')) {
    html = html.includes('</body>') ? html.replace('</body>', `${patchTag}\n</body>`) : `${html}\n${patchTag}`;
  }
  return html;
};

const { createServer, VERSION } = require('./backend-node/server');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`R2R CRM SaaS API rodando em http://${HOST}:${PORT}`);
    console.log(`[boot] versao = ${VERSION}`);
    console.log('[boot] entrada = raiz do repositorio');
  });
}

module.exports = { createServer, VERSION };

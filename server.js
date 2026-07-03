#!/usr/bin/env node
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

#!/usr/bin/env node
const { createServer, VERSION } = require('./backend-node/server');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

function extraPorts() {
  const raw = process.env.EXTRA_PORTS || (process.env.NODE_ENV === 'production' ? '80' : '');
  return raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value, index, values) => Number.isInteger(value) && value > 0 && value !== PORT && values.indexOf(value) === index);
}

function listen(port, required) {
  const server = createServer();
  server.on('error', (error) => {
    console.error(`[boot] falha ao escutar em ${HOST}:${port}: ${error.message}`);
    if (required) process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`R2R CRM SaaS API rodando em http://${HOST}:${port}`);
    console.log(`[boot] versao = ${VERSION}`);
    console.log('[boot] entrada = raiz do repositorio');
  });
}

if (require.main === module) {
  listen(PORT, true);
  for (const port of extraPorts()) listen(port, false);
}

module.exports = { createServer, VERSION };

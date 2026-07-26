# Diagnostico total do CRM - 2026-07-26

## Resumo

O backend do repositorio roda localmente pela raiz com Node.js, porta `3000`, host `0.0.0.0`, frontend servido de `frontend-public_html` e rotas `/health` e `/api/health` retornando JSON.

O problema visivel em producao nao e falta de rota no backend: o dominio publico `https://crm.r2rmarketingdigital.com.br/api/health` ainda esta retornando HTML do frontend antigo. O arquivo publico `https://crm.r2rmarketingdigital.com.br/config.js` tambem continua vindo do cache/hosting antigo (`Server: hcdn`, `Last-Modified: Mon, 06 Jul 2026`) e ainda aponta para `https://api.r2rmarketingdigital.com.br`.

## Diagnostico por area

### Backend

- Servidor principal da raiz usa `node server.js` e delega para `backend-node/server.js`.
- `Dockerfile` da raiz usa Node 20, copia a raiz do projeto, expoe porta `3000` e testa `/api/health`.
- `backend-node/server.js` agora tambem escuta em `HOST`, com padrao `0.0.0.0`, para funcionar se o provedor apontar diretamente para a pasta `backend-node`.
- Rotas de health, auth, leads, contatos/clientes, tarefas, mensagens, dashboard e Evolution API existem e responderam no smoke local.
- Testes de backend e isolamento por tenant passaram localmente.

### Frontend

- `config.js` e scripts runtime limpam `localStorage.r2r_api_base` quando ele aponta para `api.r2rmarketingdigital.com.br`, porque esse subdominio esta quebrado no ambiente atual.
- A tela de testes nao sugere mais o subdominio `api` como URL padrao.
- O botao de salvar URL do backend valida `/api/health` antes de persistir a URL no navegador.
- Chamadas diretas para Evolution continuam bloqueadas no navegador; a Evolution deve ser acessada pelo backend do CRM.

### Deploy/DNS

- O dominio `crm.r2rmarketingdigital.com.br` ainda responde por hospedagem/cache antigo, nao pelo app Node do EasyPanel.
- O subdominio `api.r2rmarketingdigital.com.br` apresentou falha TLS/servico e nao deve ser usado como backend ate apontar para o mesmo app Node.
- O EasyPanel deve publicar a raiz deste repositorio como app Node/Docker, com health check `/api/health`.

## Correcoes aplicadas

- Backend reforcado para host `0.0.0.0` tambem no Dockerfile de `backend-node`.
- Scripts frontend atualizados para bloquear configuracao de API quebrada e validar backend antes de salvar.
- `scripts/check-production.mjs` ajustado para diagnosticar quando `/api/health` retorna HTML em vez de JSON.
- Exemplos de ambiente e documentacao alinhados ao deploy de app unico em `crm.r2rmarketingdigital.com.br`.

## Validacoes executadas

- `node --check server.js`
- `node --check backend-node/server.js`
- `node --check scripts/check-production.mjs`
- `node --check frontend-public_html/config.js`
- `node --check frontend-public_html/assets/crm-saas-bridge.js`
- `node --check frontend-public_html/assets/r2r-evolution-runtime-fix.js`
- `node backend-node/tests/run-tests.js`
- `node backend-node/tests/tenant-tests.js`
- Smoke local em `http://127.0.0.1:3100` para `/`, `/api/health`, `/health`, `/api/config`, assets e `/api/leads`
- Smoke publico em `https://crm.r2rmarketingdigital.com.br/api/health`, que confirmou retorno HTML antigo

## Acao operacional obrigatoria

No EasyPanel/Hostinger, apontar `crm.r2rmarketingdigital.com.br` para o app Node criado a partir da raiz deste repositorio e remover/purgar a hospedagem estatica antiga. A publicacao esta correta somente quando:

```text
https://crm.r2rmarketingdigital.com.br/api/health
```

retornar JSON com `ok: true` e `status: "online"`.

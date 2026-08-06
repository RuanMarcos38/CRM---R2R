# R2R CRM SaaS

Repositório de produção do R2R CRM, com backend Node.js para o EasyPanel e frontend estático preparado para a Hostinger.

## Estrutura

- `frontend-public_html/`: pacote completo que deve ficar diretamente no `public_html` do subdomínio do CRM.
- `backend-node/`: API Node.js usada no EasyPanel.
- `server.js`: entrada de compatibilidade para o deploy do backend pela raiz.
- `scripts/build-hostinger-from-lovable.mjs`: atualiza o pacote Hostinger a partir da publicação aprovada do Lovable.
- `scripts/verify-hostinger-build.mjs`: verifica rotas e dependências do pacote antes do envio.

## Hostinger

Envie **o conteúdo** de `frontend-public_html/` para o `public_html` de `crm.r2rmarketingdigital.com.br`. O arquivo `index.html`, o `.htaccess`, o `serverfn-proxy.php`, o `favicon.ico` e a pasta `assets/` precisam ficar na raiz do subdomínio.

O `.htaccess`:

- desativa listagem de diretórios;
- evita cache do HTML antigo;
- mantém cache imutável dos assets versionados;
- resolve as rotas do CRM;
- encaminha somente os IDs válidos de funções do build ao proxy PHP restrito.

O `serverfn-proxy.php` requer PHP com a extensão cURL habilitada.

## Comandos

```bash
npm ci
npm test
npm run build:hostinger
npm --prefix backend-node test
```

`npm run build:hostinger` substitui o conteúdo de `frontend-public_html/` pela versão atualmente publicada em `https://salesignite-ops.lovable.app`.

## EasyPanel

O serviço do backend deve manter:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_DIR=/app/frontend-public_html
FRONTEND_URL=https://crm.r2rmarketingdigital.com.br
CORS_ORIGIN=https://crm.r2rmarketingdigital.com.br
```

As demais variáveis sensíveis devem ser configuradas somente no painel do EasyPanel. Arquivos `.env` reais não devem ser versionados.

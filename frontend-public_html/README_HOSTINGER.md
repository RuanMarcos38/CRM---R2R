# R2R CRM — pacote para Hostinger

Este diretório contém o build estático do CRM publicado em:

- https://salesignite-ops.lovable.app

## Instalação

1. Abra a pasta `public_html` do subdomínio `crm.r2rmarketingdigital.com.br`.
2. Remova ou mova para backup os arquivos da versão antiga.
3. Envie **o conteúdo deste diretório**, sem criar uma pasta adicional.
4. Confirme que `index.html`, `.htaccess`, `serverfn-proxy.php`, `favicon.ico` e `assets/` ficaram diretamente em `public_html`.
5. Limpe o cache da Hostinger e abra `https://crm.r2rmarketingdigital.com.br/?v=novo-crm`.

## Observação

As páginas públicas e as principais rotas foram pré-renderizadas. O `.htaccess` mantém o fallback do aplicativo React para rotas dinâmicas e direciona as funções protegidas ao `serverfn-proxy.php`. A extensão PHP cURL deve estar ativa (ela vem habilitada nos planos comuns da Hostinger).

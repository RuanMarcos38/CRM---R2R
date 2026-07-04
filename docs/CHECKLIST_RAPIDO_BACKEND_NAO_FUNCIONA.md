# Checklist Rapido - Backend nao funciona

## Se aparecer 502 no backend

Verifique no EasyPanel:

- App esta ligado.
- Porta interna esta `3000`.
- Start command esta `node server.js`.
- Health check esta `/health`.
- Dominio `api.r2rmarketingdigital.com.br` aponta para esse app.
- Variaveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` foram preenchidas.

## Se o frontend chamar o dominio errado

Atualize a Hostinger com os arquivos de:

```text
PACOTE_DEPLOY_R2R/frontend-public_html
```

Depois limpe no navegador:

```js
localStorage.removeItem('r2r_api_base')
location.reload()
```

## Resultado esperado

```text
https://api.r2rmarketingdigital.com.br/health
```

deve retornar JSON, nunca HTML e nunca 502.

## Evolution / QR Code

O dominio da Evolution tambem precisa responder publicamente. No print atual, esta URL nao resolve DNS:

```text
https://evolution-evolution-api.hij8h.easypanel.host
```

Corrija o dominio no EasyPanel antes de testar QR Code.

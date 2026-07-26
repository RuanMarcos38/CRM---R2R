# Checklist Rapido - Backend nao funciona

## Se aparecer 502 no backend

Verifique no EasyPanel:

- App esta ligado.
- Porta interna esta `3000`.
- Start command esta `node server.js`.
- Health check esta `/api/health`.
- Dominio `crm.r2rmarketingdigital.com.br` aponta para esse app Node.
- O subdominio `api.r2rmarketingdigital.com.br` nao deve ser usado se estiver apontando para outro servico.
- Variaveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` foram preenchidas.

## Se o frontend chamar o dominio errado

Publique a raiz deste repositorio como app Node/Docker no EasyPanel. Nao publique uma copia antiga separada em Hostinger/public_html.

```text
RuanMarcos38/CRM---R2R
```

Depois limpe no navegador:

```js
localStorage.removeItem('r2r_api_base')
location.reload()
```

## Resultado esperado

```text
https://crm.r2rmarketingdigital.com.br/api/health
```

deve retornar JSON, nunca HTML e nunca 502. Se retornar HTML, o dominio esta servindo frontend estatico antigo em vez do backend Node.

## Evolution / QR Code

O dominio da Evolution tambem precisa responder publicamente. No print atual, esta URL nao resolve DNS:

```text
https://evolution-evolution-api.hij8h.easypanel.host
```

Corrija o dominio no EasyPanel antes de testar QR Code.

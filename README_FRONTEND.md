# Frontend - R2R CRM

Envie o conteudo desta pasta para o `public_html` da Hostinger ou outra hospedagem estatica.

Antes de publicar, edite `config.js`:

```js
window.R2R_CONFIG = Object.assign({
  API_BASE_URL: 'https://api.seudominio.com.br',
  APP_NAME: 'R2R CRM',
  ENV: 'production',
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sua-chave-publica'
}, window.R2R_CONFIG || {});
```

Nao coloque chaves secretas neste frontend.


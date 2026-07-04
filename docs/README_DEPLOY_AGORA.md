# Deploy R2R CRM - Pacote Pronto

## Backend no EasyPanel

1. Crie ou atualize o app Node.js apontando para esta pasta `PACOTE_DEPLOY_R2R`.
2. Porta interna: `3000`.
3. Start command:

```bash
node server.js
```

4. Health check:

```text
/health
```

5. Copie as variaveis de `.env.production.easypanel.example` para o painel de Environment do EasyPanel.
6. Preencha os segredos reais de Supabase e Evolution.
7. O dominio publico do backend deve ser:

```text
https://api.r2rmarketingdigital.com.br
```

8. Depois do deploy, teste:

```text
https://api.r2rmarketingdigital.com.br/health
```

Precisa retornar JSON com `"status": "online"`.

## Frontend na Hostinger

Envie todo o conteudo da pasta:

```text
PACOTE_DEPLOY_R2R/frontend-public_html
```

para o `public_html` do dominio:

```text
https://crm.r2rmarketingdigital.com.br
```

Arquivos principais que precisam substituir os antigos:

- `config.js`
- `index.html`
- `assets/crm-saas-bridge.js`

Depois limpe o cache do navegador ou abra uma aba anonima.

## Evolution API

A URL abaixo do print atual nao esta resolvendo DNS:

```text
https://evolution-evolution-api.hij8h.easypanel.host
```

A URL vista anteriormente tambem nao resolvia DNS:

```text
https://evolution-evolution-api.mjl8h.easypanel.host
```

Antes do QR Code funcionar, a Evolution precisa ter uma URL publica valida. Teste a URL no navegador; ela precisa abrir/responder. Depois coloque essa URL em:

```env
EVOLUTION_API_URL=https://sua-url-evolution-valida
EVOLUTION_API_KEY=sua-api-key-global
EVOLUTION_INSTANCE_NAME=Ruan
```

## Testes finais

1. `https://api.r2rmarketingdigital.com.br/health` retorna JSON.
2. `https://api.r2rmarketingdigital.com.br/api/config` retorna JSON.
3. `https://crm.r2rmarketingdigital.com.br/config.js` contem `https://api.r2rmarketingdigital.com.br`.
4. `https://crm.r2rmarketingdigital.com.br/assets/crm-saas-bridge.js` contem `20260704-evo-inline`.
5. No CRM, Ajustes > WhatsApp > Salvar > Conectar.

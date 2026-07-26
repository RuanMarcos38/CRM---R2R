# Deploy R2R CRM - EasyPanel

## Aplicacao unica no EasyPanel

1. Crie ou atualize o app apontando para a raiz deste repositorio.
2. Use Node.js 20.
3. Porta interna: `3000`.
4. Start command:

```bash
node server.js
```

5. Health check:

```text
/api/health
```

6. Copie as variaveis de `.env.production.easypanel.example` para o painel de Environment do EasyPanel.
7. Preencha os segredos reais de Supabase e Evolution.
8. O dominio publico principal do CRM deve apontar para este mesmo app Node:

```text
https://crm.r2rmarketingdigital.com.br
```

9. Se usar o dominio separado da API, ele tambem deve apontar para este mesmo app Node:

```text
https://api.r2rmarketingdigital.com.br
```

10. Depois do deploy, teste:

```text
https://crm.r2rmarketingdigital.com.br/api/health
https://api.r2rmarketingdigital.com.br/api/health
```

Precisa retornar JSON com `"status": "online"`.

## Frontend

O frontend e servido pelo proprio backend a partir de `frontend-public_html`. Nao publique uma copia antiga separada em Hostinger/public_html, porque isso pode carregar JavaScript antigo e ignorar as correcoes do backend.

Arquivos principais que precisam estar atualizados no deploy:

- `config.js`
- `index.html`
- `assets/crm-saas-bridge.js`

Depois do deploy, limpe o cache do navegador ou abra uma aba anonima.

## Evolution API

Antes do QR Code funcionar, a Evolution precisa ter uma URL publica valida, uma API Key Global valida e uma instancia existente ou criavel. Coloque esses valores nas variaveis do EasyPanel ou salve pela tela Ajustes > WhatsApp:

```env
EVOLUTION_API_URL=https://sua-url-evolution-valida
EVOLUTION_API_KEY=sua-api-key-global
EVOLUTION_INSTANCE=Ruan
```

## Testes finais

1. `https://crm.r2rmarketingdigital.com.br/api/health` retorna JSON.
2. `https://crm.r2rmarketingdigital.com.br/api/config` retorna JSON.
3. `https://crm.r2rmarketingdigital.com.br/assets/crm-saas-bridge.js` contem `20260725-backend-only-evolution`.
4. No CRM, Ajustes > WhatsApp > Salvar > Conectar.
5. O QR Code deve vir de `/api/integrations/evolution/connect` ou `/api/integrations/evolution/qrcode`, nunca de chamadas diretas do navegador para a Evolution.

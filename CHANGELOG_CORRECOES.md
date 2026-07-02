# Changelog de Correções — R2R CRM SaaS

## Backend

- Criado backend Node.js Enterprise sem dependências externas obrigatórias.
- Corrigido padrão de resposta JSON: `success`, `data`, `message`, `error`, `code`.
- Implementadas rotas de health, autenticação, dashboard, recursos CRM, relatórios, webhooks e integrações.
- Implementado middleware de autenticação por Supabase JWT.
- Implementado vínculo multiempresa via `company_members`.
- Implementado filtro obrigatório por `company_id` em dados operacionais.
- Implementado CORS por variável de ambiente.
- Implementados headers básicos de segurança.
- Implementado rate limit simples por IP/rota.
- Implementado bloqueio de service role no frontend por arquitetura.
- Implementado mascaramento de chaves sensíveis em respostas de integração.
- Implementadas integrações seguras para OpenAI e Evolution API via backend.
- Implementados webhooks com validação por `WEBHOOK_SECRET`.
- Implementado modo de teste local isolado via `R2R_TEST_MODE=1`.

## Supabase

- Criado schema completo multiempresa.
- Criadas tabelas para empresas, usuários, membros, leads, clientes, funil, tarefas, conversas, mensagens, integrações, IA, arquivos, financeiro e auditoria.
- Criados índices para performance em `company_id`, status, datas, funil e conversas.
- Criados triggers automáticos de `updated_at`.
- Ativado RLS nas tabelas críticas.
- Criadas policies por empresa.
- Criado patch de compatibilidade para tabelas antigas sem `company_id`.
- Criado seed seguro para planos e admin inicial sem senha hard-coded.

## Frontend

- Nenhuma alteração visual realizada.
- Orientação técnica incluída apenas para apontar `config.js`/`window.R2R_API_BASE` para a API correta, sem mexer em layout.

## Deploy

- Criado Dockerfile para EasyPanel.
- Criado `.env.example` completo.
- Criado README de instalação em produção.
- Criado teste automatizado local.

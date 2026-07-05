-- R2R CRM SaaS Core
-- Aplicar no Supabase SQL Editor ou via Supabase CLI.
-- O CLI nao estava disponivel no ambiente de edicao, por isso o arquivo foi criado manualmente.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.planos (
  id text primary key,
  name text not null,
  descricao text,
  price_cents integer not null default 0,
  max_users integer,
  max_leads integer,
  max_funis integer,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique,
  cnpj text,
  telefone text,
  email text,
  site text,
  nicho text not null default 'marketing_digital',
  status text not null default 'ativo' check (status in ('ativo','suspenso','bloqueado','trial','cancelado','inadimplente')),
  plano_id text references public.planos(id),
  nome_sistema text not null default 'R2R CRM IA',
  logo_url text,
  cor_primaria text not null default '#7c3aed',
  dominio_personalizado text,
  limites jsonb not null default '{}'::jsonb,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  auth_user_id uuid,
  nome text not null,
  email text not null,
  telefone text,
  funcao text,
  tipo_usuario text not null default 'usuario' check (tipo_usuario in ('super_admin','company_admin','admin','administrador','manager','gestor','vendedor','comercial','atendente','financeiro','usuario','usuario_comum','limitado','visualizador')),
  status text not null default 'ativo' check (status in ('ativo','inativo','bloqueado','pendente')),
  permissoes jsonb not null default '{}'::jsonb,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, email)
);

alter table public.usuarios drop constraint if exists usuarios_tipo_usuario_check;
alter table public.usuarios add constraint usuarios_tipo_usuario_check
  check (tipo_usuario in ('super_admin','company_admin','admin','administrador','manager','gestor','vendedor','comercial','atendente','financeiro','usuario','usuario_comum','limitado','visualizador'));

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  plan_id text references public.planos(id),
  provider text not null default 'checkout_link',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'pending',
  valor_mensal numeric(12,2) default 0,
  checkout_url text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  nicho text default 'marketing_digital',
  tipo text default 'vendas',
  padrao boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funil_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funil_id uuid not null references public.funis(id) on delete cascade,
  nome text not null,
  cor text not null default '#7c3aed',
  ordem integer not null default 0,
  probabilidade numeric(5,2) not null default 0,
  sla_horas integer,
  automacoes jsonb not null default '[]'::jsonb,
  etapa_ganha boolean not null default false,
  etapa_perdida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  documento text,
  empresa text,
  cidade text,
  estado text,
  nicho text,
  interesse text,
  origem_lead text,
  origem_nome text,
  midia text,
  canal text,
  campanha text,
  conjunto_anuncios text,
  criativo text,
  palavra_chave text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  pagina_entrada text,
  formulario_origem text,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  vendedor_id uuid references public.usuarios(id) on delete set null,
  temperatura text default 'morno' check (temperatura in ('frio','morno','quente','Frio','Morno','Quente')),
  score integer not null default 50 check (score >= 0 and score <= 100),
  funil_id uuid references public.funis(id) on delete set null,
  etapa_id uuid references public.funil_etapas(id) on delete set null,
  etapa text not null default 'Novo Lead',
  status text not null default 'novo',
  valor numeric(12,2) not null default 0,
  ultima_interacao timestamptz,
  proxima_acao timestamptz,
  motivo_perda text,
  notas text,
  observacoes text,
  tags jsonb not null default '[]'::jsonb,
  campos_extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  nome text not null,
  empresa text,
  cnpj text,
  cpf text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  nicho text,
  segmento text,
  plano_servico text,
  status text not null default 'ativo',
  responsavel_id uuid references public.usuarios(id) on delete set null,
  data_entrada date default current_date,
  arquivos jsonb not null default '[]'::jsonb,
  contratos jsonb not null default '[]'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  funil_id uuid references public.funis(id) on delete set null,
  etapa_id uuid references public.funil_etapas(id) on delete set null,
  etapa text,
  valor_estimado numeric(12,2) not null default 0,
  servico_interesse text,
  probabilidade numeric(5,2) default 0,
  data_prevista_fechamento date,
  status text not null default 'aberta',
  responsavel_id uuid references public.usuarios(id) on delete set null,
  fonte text,
  campanha text,
  motivo_perda text,
  observacoes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  tipo text not null default 'nota',
  descricao text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  titulo text not null,
  descricao text,
  prioridade text not null default 'media',
  prazo date,
  lembrete_em timestamptz,
  status text not null default 'Pendente',
  comentarios jsonb not null default '[]'::jsonb,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  canal text not null default 'whatsapp',
  wa_contact_id text,
  external_id text,
  status text not null default 'aberta',
  responsavel_id uuid references public.usuarios(id) on delete set null,
  tags jsonb not null default '[]'::jsonb,
  nao_lidas integer not null default 0,
  ultima_mensagem text,
  ultima_mensagem_em timestamptz,
  sla_vencimento timestamptz,
  ia_pausada boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  direcao text not null default 'outbound',
  canal text not null default 'whatsapp',
  tipo text not null default 'text',
  texto text,
  anexo_url text,
  external_id text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  canal text,
  objetivo text,
  investimento numeric(12,2) not null default 0,
  periodo_inicio date,
  periodo_fim date,
  publico text,
  criativo text,
  status text not null default 'ativa',
  leads_gerados integer not null default 0,
  conversoes integer not null default 0,
  receita_gerada numeric(12,2) not null default 0,
  meta_campaign_id text,
  utm_campaign text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fontes_lead (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  grupo text,
  ativo boolean not null default true,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave text not null,
  valor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, chave)
);

create table if not exists public.integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null,
  nome text not null,
  status text not null default 'nao_configurada',
  ativa boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  ultimo_erro text,
  ultima_sincronizacao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, tipo)
);

create table if not exists public.automacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  gatilho text not null,
  condicoes jsonb not null default '{}'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  execucoes integer not null default 0,
  ultima_execucao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automacao_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid references public.automacoes(id) on delete cascade,
  ordem integer not null default 0,
  tipo text not null,
  parametros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete cascade,
  nome text not null,
  path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cor text not null default '#7c3aed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, tag_id)
);

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  titulo text not null,
  corpo text,
  tipo text default 'info',
  lida boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhooks_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  tipo text,
  direction text not null default 'inbound',
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  erro text,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_webhooks (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete set null,
  provider text,
  event_type text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.billing_webhooks
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  antes jsonb,
  depois jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  prefixo text,
  key_hash text not null unique,
  status text not null default 'ativa',
  permissoes jsonb not null default '{}'::jsonb,
  ultimo_uso timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  modulos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  feature_name text not null,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, feature_name)
);

create table if not exists public.ia_agentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  setor text not null,
  nicho text default 'marketing_digital',
  tom_voz text default 'consultivo',
  prompt text not null,
  regras jsonb not null default '{}'::jsonb,
  base_conhecimento jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  limite_mensagens_ciclo integer default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates_nicho (
  id uuid primary key default gen_random_uuid(),
  nicho text not null unique,
  nome text not null,
  funil jsonb not null default '[]'::jsonb,
  campos_lead jsonb not null default '[]'::jsonb,
  produtos_servicos jsonb not null default '[]'::jsonb,
  prompt_ia text,
  relatorios jsonb not null default '[]'::jsonb,
  automacoes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  entidade text not null,
  nome text not null,
  tipo text not null default 'text',
  opcoes jsonb not null default '[]'::jsonb,
  obrigatorio boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.planos (id, name, descricao, price_cents, max_users, max_leads, max_funis, features)
values
('starter', 'Starter', 'Ate 3 usuarios, 1.000 leads, 1 funil, WhatsApp e dashboard basico.', 79000, 3, 1000, 1, '{"whatsapp":true,"dashboard":"basic"}'),
('business', 'Business', 'Ate 10 usuarios, 10.000 leads, funis ilimitados, automacoes, IA, Meta Ads e webhooks.', 150000, 10, 10000, null, '{"whatsapp":true,"automation":true,"ai":true,"meta_ads":true,"webhooks":true}'),
('premium', 'Premium', 'White label, API publica, integracoes avancadas, multiunidades e suporte prioritario.', 320000, null, null, null, '{"white_label":true,"api":true,"advanced_integrations":true,"priority_support":true}')
on conflict (id) do update set
  name = excluded.name,
  descricao = excluded.descricao,
  price_cents = excluded.price_cents,
  max_users = excluded.max_users,
  max_leads = excluded.max_leads,
  max_funis = excluded.max_funis,
  features = excluded.features,
  updated_at = now();

insert into public.templates_nicho (nicho, nome, funil, campos_lead, produtos_servicos, prompt_ia, relatorios, automacoes)
values
('marketing_digital','Marketing Digital',
'["Novo Lead","Primeiro Contato","Diagnostico","Qualificado","Reuniao Agendada","Proposta Enviada","Negociacao","Contrato Enviado","Fechado/Ganho","Perdido","Follow-up Futuro"]',
'["orcamento_disponivel","objetivo_campanha","nicho","cidade_regiao","redes_sociais","site_atual"]',
'["Gestao de trafego","Criacao de sites","Landing pages","E-commerce","CRM com IA","Automacao de atendimento","Mentoria/curso"]',
'Voce e um SDR consultivo para agencia de marketing digital. Qualifique objetivo, verba, nicho, regiao e maturidade antes de propor reuniao.',
'["ROI por campanha","CPL","Conversao por etapa","Performance por vendedor"]',
'["Criar tarefa quando lead entrar","Follow-up apos proposta","Distribuicao por vendedor","Alerta sem resposta 24h"]'),
('imobiliario','Imobiliario','["Entrada","Contato Inicial","Perfil do Imovel","Visita Agendada","Proposta","Negociacao","Fechado","Perdido","Reativacao"]','["tipo_imovel","faixa_preco","bairro","financiamento","prazo_compra"]','["Venda","Locacao","Lancamento","Captacao"]','Qualifique interesse imobiliario, faixa de preco, bairro e prazo de compra.', '["Leads por bairro","Visitas agendadas","Taxa proposta"]','["Agendar visita","Follow-up de proposta"]'),
('clinica_estetica','Clinica/Estetica','["Entrada","Triagem","Agendamento","Compareceu","Plano indicado","Fechado","Perdido","Retorno"]','["procedimento","queixa","data_preferida","unidade"]','["Consulta","Procedimento","Pacote","Retorno"]','Atenda com cuidado, colete necessidade, unidade e melhor horario.', '["Agendamentos","Comparecimento","Receita por procedimento"]','["Confirmacao de agenda","Lembrete 24h"]'),
('educacao_cursos','Educacao/Cursos','["Entrada","Contato","Interesse","Aula Demo","Matricula","Perdido","Reativacao"]','["curso","nivel","modalidade","inicio_desejado"]','["Curso online","Curso presencial","Mentoria","Workshop"]','Qualifique curso, objetivo e disponibilidade.', '["Matriculas","Conversao aula demo","Origem"]','["Convite aula demo","Follow-up matricula"]'),
('ecommerce','E-commerce','["Entrada","Atendimento","Produto indicado","Carrinho","Pagamento","Fechado","Perdido","Recompra"]','["produto","ticket","cupom","origem"]','["Produto","Kit","Assinatura"]','Ajude na escolha do produto e reduza friccao de compra.', '["Receita","Carrinhos","Recompra"]','["Recuperar carrinho","Pos-venda"]'),
('prestadores_servico','Prestadores de Servico','["Entrada","Diagnostico","Orcamento","Execucao","Fechado","Perdido","Retorno"]','["servico","urgencia","local","orcamento"]','["Servico pontual","Contrato mensal","Consultoria"]','Qualifique urgencia, local, escopo e orcamento.', '["Orcamentos","Fechamentos","Prazo medio"]','["Lembrete de orcamento","Pesquisa pos-servico"]'),
('eventos','Eventos','["Entrada","Briefing","Proposta","Contrato","Producao","Realizado","Perdido"]','["data_evento","local","numero_pessoas","tipo_evento"]','["Evento corporativo","Festa","Workshop","Congresso"]','Colete data, publico, local e objetivo do evento.', '["Eventos por periodo","Receita prevista","Conversao proposta"]','["Follow-up proposta","Checklist evento"]'),
('consultorias','Consultorias','["Entrada","Diagnostico","Reuniao","Proposta","Negociacao","Contrato","Perdido"]','["area","tamanho_empresa","dor_principal","prazo"]','["Diagnostico","Projeto","Retainer","Mentoria"]','Qualifique dor, decisor, budget e prazo.', '["Pipeline","Ticket medio","Ciclo de venda"]','["Agendar diagnostico","Follow-up executivo"]'),
('vendas_b2b','Vendas B2B','["Entrada","SDR","Qualificado","Demo","Proposta","Negociacao","Ganho","Perdido"]','["cargo","empresa_tamanho","dor","budget","autoridade"]','["SaaS","Servico","Licenca","Projeto"]','Use criterios BANT/MEDDIC de forma natural.', '["Conversao por etapa","Receita prevista","Performance SDR"]','["Cadencia SDR","Reativacao"]'),
('atendimento_local','Atendimento Local','["Entrada","Contato","Agendamento","Atendido","Fechado","Perdido","Retorno"]','["bairro","servico","urgencia","horario"]','["Servico local","Visita tecnica","Contrato"]','Colete localidade, urgencia e melhor horario.', '["Atendimentos","SLA","Origem local"]','["Lembrete agenda","Pesquisa satisfacao"]')
on conflict (nicho) do update set
  nome = excluded.nome,
  funil = excluded.funil,
  campos_lead = excluded.campos_lead,
  produtos_servicos = excluded.produtos_servicos,
  prompt_ia = excluded.prompt_ia,
  relatorios = excluded.relatorios,
  automacoes = excluded.automacoes,
  updated_at = now();

create or replace function app_private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = (select auth.uid())
      and u.status = 'ativo'
      and u.tipo_usuario = 'super_admin'
  );
$$;

create or replace function app_private.has_empresa_access(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_super_admin()
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = (select auth.uid())
        and u.status = 'ativo'
        and u.empresa_id = target_empresa_id
    );
$$;

create or replace function app_private.has_empresa_role(target_empresa_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.is_super_admin()
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = (select auth.uid())
        and u.status = 'ativo'
        and u.empresa_id = target_empresa_id
        and u.tipo_usuario = any(allowed_roles)
    );
$$;

create or replace function app_private.can_write_empresa(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.has_empresa_role(
    target_empresa_id,
    array['company_admin','admin','administrador','manager','gestor','vendedor','comercial','atendente','financeiro','usuario','usuario_comum']
  );
$$;

create or replace function app_private.is_empresa_admin(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.has_empresa_role(
    target_empresa_id,
    array['company_admin','admin','administrador']
  );
$$;

revoke all on function app_private.is_super_admin() from public;
revoke all on function app_private.has_empresa_access(uuid) from public;
revoke all on function app_private.has_empresa_role(uuid, text[]) from public;
revoke all on function app_private.can_write_empresa(uuid) from public;
revoke all on function app_private.is_empresa_admin(uuid) from public;
grant execute on function app_private.is_super_admin() to authenticated, service_role;
grant execute on function app_private.has_empresa_access(uuid) to authenticated, service_role;
grant execute on function app_private.has_empresa_role(uuid, text[]) to authenticated, service_role;
grant execute on function app_private.can_write_empresa(uuid) to authenticated, service_role;
grant execute on function app_private.is_empresa_admin(uuid) to authenticated, service_role;

create or replace function app_private.enforce_same_empresa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i integer;
  field_name text;
  target_table text;
  target_id uuid;
  target_empresa_id uuid;
begin
  if new.empresa_id is null then
    return new;
  end if;

  i := 0;
  while i < TG_NARGS loop
    field_name := TG_ARGV[i];
    target_table := TG_ARGV[i + 1];
    execute format('select ($1).%I::uuid', field_name) using new into target_id;

    if target_id is not null then
      execute format('select empresa_id from public.%I where id = $1', target_table)
        into target_empresa_id
        using target_id;

      if target_empresa_id is null or target_empresa_id <> new.empresa_id then
        raise exception 'tenant mismatch on %.%', TG_TABLE_NAME, field_name using errcode = '42501';
      end if;
    end if;

    i := i + 2;
  end loop;

  return new;
end;
$$;

revoke all on function app_private.enforce_same_empresa() from public;

drop trigger if exists trg_clientes_same_empresa on public.clientes;
create trigger trg_clientes_same_empresa before insert or update on public.clientes
for each row execute function app_private.enforce_same_empresa('lead_id','leads','responsavel_id','usuarios');

drop trigger if exists trg_oportunidades_same_empresa on public.oportunidades;
create trigger trg_oportunidades_same_empresa before insert or update on public.oportunidades
for each row execute function app_private.enforce_same_empresa('lead_id','leads','cliente_id','clientes','responsavel_id','usuarios');

drop trigger if exists trg_atividades_same_empresa on public.atividades;
create trigger trg_atividades_same_empresa before insert or update on public.atividades
for each row execute function app_private.enforce_same_empresa('lead_id','leads','cliente_id','clientes','usuario_id','usuarios');

drop trigger if exists trg_tarefas_same_empresa on public.tarefas;
create trigger trg_tarefas_same_empresa before insert or update on public.tarefas
for each row execute function app_private.enforce_same_empresa('lead_id','leads','cliente_id','clientes','responsavel_id','usuarios');

drop trigger if exists trg_conversas_same_empresa on public.conversas;
create trigger trg_conversas_same_empresa before insert or update on public.conversas
for each row execute function app_private.enforce_same_empresa('lead_id','leads','cliente_id','clientes','responsavel_id','usuarios');

drop trigger if exists trg_mensagens_same_empresa on public.mensagens;
create trigger trg_mensagens_same_empresa before insert or update on public.mensagens
for each row execute function app_private.enforce_same_empresa('conversa_id','conversas','lead_id','leads','cliente_id','clientes','usuario_id','usuarios');

drop trigger if exists trg_automacao_regras_same_empresa on public.automacao_regras;
create trigger trg_automacao_regras_same_empresa before insert or update on public.automacao_regras
for each row execute function app_private.enforce_same_empresa('automacao_id','automacoes');

drop trigger if exists trg_arquivos_same_empresa on public.arquivos;
create trigger trg_arquivos_same_empresa before insert or update on public.arquivos
for each row execute function app_private.enforce_same_empresa('lead_id','leads','cliente_id','clientes','oportunidade_id','oportunidades','uploaded_by','usuarios');

drop trigger if exists trg_lead_tags_same_empresa on public.lead_tags;
create trigger trg_lead_tags_same_empresa before insert or update on public.lead_tags
for each row execute function app_private.enforce_same_empresa('lead_id','leads','tag_id','tags');

drop trigger if exists trg_notificacoes_same_empresa on public.notificacoes;
create trigger trg_notificacoes_same_empresa before insert or update on public.notificacoes
for each row execute function app_private.enforce_same_empresa('usuario_id','usuarios');

drop trigger if exists trg_audit_logs_same_empresa on public.audit_logs;
create trigger trg_audit_logs_same_empresa before insert or update on public.audit_logs
for each row execute function app_private.enforce_same_empresa('usuario_id','usuarios');

do $$
declare
  t text;
begin
  foreach t in array array[
    'empresas','usuarios','assinaturas','funis','funil_etapas','leads','clientes','oportunidades',
    'atividades','tarefas','conversas','mensagens','campanhas','fontes_lead','configuracoes',
    'integracoes','automacoes','automacao_regras','arquivos','tags','lead_tags','notificacoes',
    'webhooks_logs','audit_logs','api_keys','permissoes','feature_flags','ia_agentes','campos_personalizados'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

alter table public.planos enable row level security;
alter table public.templates_nicho enable row level security;
alter table public.billing_webhooks enable row level security;

drop policy if exists "planos_select_public" on public.planos;
create policy "planos_select_public" on public.planos
for select to anon, authenticated
using (active = true);

drop policy if exists "templates_nicho_select" on public.templates_nicho;
create policy "templates_nicho_select" on public.templates_nicho
for select to authenticated
using (true);

drop policy if exists "empresas_select" on public.empresas;
create policy "empresas_select" on public.empresas
for select to authenticated
using (app_private.has_empresa_access(id));

drop policy if exists "empresas_admin_update" on public.empresas;
create policy "empresas_admin_update" on public.empresas
for update to authenticated
using (app_private.is_empresa_admin(id))
with check (app_private.is_empresa_admin(id));

drop policy if exists "empresas_super_admin_insert" on public.empresas;
create policy "empresas_super_admin_insert" on public.empresas
for insert to authenticated
with check (app_private.is_super_admin());

drop policy if exists "empresas_super_admin_delete" on public.empresas;
create policy "empresas_super_admin_delete" on public.empresas
for delete to authenticated
using (app_private.is_super_admin());

drop policy if exists "usuarios_select" on public.usuarios;
create policy "usuarios_select" on public.usuarios
for select to authenticated
using (app_private.has_empresa_access(empresa_id) or auth_user_id = (select auth.uid()));

drop policy if exists "usuarios_insert_admin" on public.usuarios;
create policy "usuarios_insert_admin" on public.usuarios
for insert to authenticated
with check (app_private.is_empresa_admin(empresa_id));

drop policy if exists "usuarios_update_admin" on public.usuarios;
create policy "usuarios_update_admin" on public.usuarios
for update to authenticated
using (app_private.is_empresa_admin(empresa_id))
with check (app_private.is_empresa_admin(empresa_id));

drop policy if exists "usuarios_delete_admin" on public.usuarios;
create policy "usuarios_delete_admin" on public.usuarios
for delete to authenticated
using (app_private.is_empresa_admin(empresa_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads','clientes','oportunidades','atividades','tarefas','conversas','mensagens',
    'campanhas','fontes_lead','arquivos','tags','lead_tags','notificacoes'
  ]
  loop
    execute format('drop policy if exists tenant_select on public.%I', t);
    execute format('drop policy if exists tenant_insert on public.%I', t);
    execute format('drop policy if exists tenant_update on public.%I', t);
    execute format('drop policy if exists tenant_delete on public.%I', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.has_empresa_access(empresa_id))', t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (app_private.can_write_empresa(empresa_id))', t);
    execute format('create policy tenant_update on public.%I for update to authenticated using (app_private.can_write_empresa(empresa_id)) with check (app_private.can_write_empresa(empresa_id))', t);
    execute format('create policy tenant_delete on public.%I for delete to authenticated using (app_private.can_write_empresa(empresa_id))', t);
  end loop;

  foreach t in array array[
    'assinaturas','funis','funil_etapas','configuracoes','integracoes','automacoes',
    'automacao_regras','webhooks_logs','audit_logs','api_keys','permissoes','feature_flags','ia_agentes',
    'campos_personalizados'
  ]
  loop
    execute format('drop policy if exists tenant_select on public.%I', t);
    execute format('drop policy if exists tenant_insert on public.%I', t);
    execute format('drop policy if exists tenant_update on public.%I', t);
    execute format('drop policy if exists tenant_delete on public.%I', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.has_empresa_access(empresa_id))', t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (app_private.is_empresa_admin(empresa_id))', t);
    execute format('create policy tenant_update on public.%I for update to authenticated using (app_private.is_empresa_admin(empresa_id)) with check (app_private.is_empresa_admin(empresa_id))', t);
    execute format('create policy tenant_delete on public.%I for delete to authenticated using (app_private.is_empresa_admin(empresa_id))', t);
  end loop;
end $$;

drop policy if exists "billing_webhooks_super_admin" on public.billing_webhooks;
create policy "billing_webhooks_super_admin" on public.billing_webhooks
for all to authenticated
using (app_private.is_super_admin())
with check (app_private.is_super_admin());

grant usage on schema public to anon, authenticated, service_role;
grant select on public.planos to anon, authenticated, service_role;
grant select on public.templates_nicho to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'planos','empresas','usuarios','assinaturas','funis','funil_etapas','leads','clientes','oportunidades',
    'tarefas','conversas','campanhas','fontes_lead','configuracoes','integracoes','automacoes',
    'automacao_regras','tags','api_keys','permissoes','ia_agentes','templates_nicho','campos_personalizados'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create unique index if not exists idx_usuarios_auth_user_id_unique on public.usuarios(auth_user_id) where auth_user_id is not null;
create index if not exists idx_usuarios_empresa_id on public.usuarios(empresa_id);
create index if not exists idx_leads_empresa_created on public.leads(empresa_id, created_at desc);
create index if not exists idx_leads_empresa_etapa on public.leads(empresa_id, etapa);
create index if not exists idx_leads_empresa_status on public.leads(empresa_id, status);
create index if not exists idx_leads_empresa_origem on public.leads(empresa_id, origem_nome);
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_leads_telefone on public.leads(telefone);
create index if not exists idx_oportunidades_empresa_status on public.oportunidades(empresa_id, status);
create index if not exists idx_oportunidades_fechamento on public.oportunidades(empresa_id, data_prevista_fechamento);
create index if not exists idx_tarefas_empresa_prazo on public.tarefas(empresa_id, prazo);
create index if not exists idx_conversas_empresa_status on public.conversas(empresa_id, status);
create index if not exists idx_conversas_empresa_external on public.conversas(empresa_id, external_id);
create index if not exists idx_mensagens_conversa_created on public.mensagens(conversa_id, created_at);
create unique index if not exists idx_mensagens_empresa_external_unique on public.mensagens(empresa_id, external_id) where external_id is not null;
create index if not exists idx_campanhas_empresa_status on public.campanhas(empresa_id, status);
create index if not exists idx_integracoes_empresa_tipo on public.integracoes(empresa_id, tipo);
create index if not exists idx_audit_empresa_created on public.audit_logs(empresa_id, created_at desc);
create index if not exists idx_feature_flags_empresa_feature on public.feature_flags(empresa_id, feature_name);
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
create index if not exists idx_leads_tags_gin on public.leads using gin(tags);
create index if not exists idx_leads_campos_extras_gin on public.leads using gin(campos_extras);

create or replace view public.dashboard_resumo
with (security_invoker = true)
as
select
  e.id as empresa_id,
  e.nome as empresa_nome,
  (select count(*) from public.leads l where l.empresa_id = e.id) as total_leads,
  (select count(*) from public.clientes c where c.empresa_id = e.id) as total_clientes,
  (select count(*) from public.oportunidades o where o.empresa_id = e.id and o.status = 'aberta') as oportunidades_abertas,
  (select coalesce(sum(o.valor_estimado), 0) from public.oportunidades o where o.empresa_id = e.id and o.status = 'aberta') as valor_pipeline,
  (select count(*) from public.mensagens m where m.empresa_id = e.id and m.created_at >= now() - interval '7 days') as mensagens_7d,
  now() as atualizado_em
from public.empresas e;

create or replace view public.contatos
with (security_invoker = true)
as
select * from public.clientes;

create or replace view public.atendimentos
with (security_invoker = true)
as
select * from public.conversas;

create or replace view public.logs
with (security_invoker = true)
as
select * from public.audit_logs;

grant select on public.dashboard_resumo to authenticated, service_role;
grant select on public.contatos to authenticated, service_role;
grant select on public.atendimentos to authenticated, service_role;
grant select on public.logs to authenticated, service_role;

-- R2R CRM SaaS — Schema Supabase/PostgreSQL Enterprise
-- Data: 2026-07-02
-- Objetivo: corrigir base multiempresa, RLS, índices, triggers e tabelas necessárias sem alterar frontend.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =========================================================
-- Funções utilitárias
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.role in ('super_admin','company_admin','admin_empresa','admin')
  );
$$;

-- =========================================================
-- Núcleo SaaS
-- =========================================================
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  status text not null default 'active' check (status in ('active','inactive','suspended','trial')),
  plan text not null default 'starter',
  phone text,
  email text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  auth_user_id uuid unique,
  name text,
  email text not null,
  phone text,
  avatar_url text,
  role text not null default 'viewer',
  status text not null default 'active' check (status in ('active','inactive','invited','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'viewer' check (role in ('super_admin','company_admin','admin_empresa','manager','gestor','sales','vendedor','support','atendimento','financeiro','viewer','visualizador','admin')),
  status text not null default 'active' check (status in ('active','inactive','invited','blocked')),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, slug)
);

-- =========================================================
-- CRM operacional
-- =========================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  assigned_to uuid,
  name text,
  email text,
  phone text,
  document text,
  source text,
  origin text,
  status text not null default 'new',
  score integer default 0,
  value numeric(14,2) default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  converted_client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  assigned_to uuid,
  name text not null,
  email text,
  phone text,
  document text,
  status text not null default 'active',
  source_lead_id uuid references public.leads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.leads
  drop constraint if exists leads_converted_client_id_fkey;
alter table if exists public.leads
  add constraint leads_converted_client_id_fkey foreign key (converted_client_id) references public.clients(id) on delete set null;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  name text,
  email text,
  phone text,
  type text default 'primary',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text,
  probability integer default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  title text not null default 'Nova oportunidade',
  value numeric(14,2) default 0,
  status text not null default 'open',
  expected_close_date date,
  assigned_to uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  assigned_to uuid,
  title text not null,
  description text,
  due_at timestamptz,
  priority text default 'normal',
  status text not null default 'pending',
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- Atendimento / WhatsApp / Mensagens
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to uuid,
  channel text not null default 'whatsapp',
  phone text,
  contact_name text,
  status text not null default 'open',
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  direction text not null default 'inbound' check (direction in ('inbound','outbound','internal')),
  channel text not null default 'whatsapp',
  phone text,
  contact_name text,
  content text,
  message_type text default 'text',
  provider_message_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  provider_response jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  file_id uuid,
  url text,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'evolution',
  instance_name text not null,
  status text not null default 'disconnected',
  config jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider, instance_name)
);

-- =========================================================
-- Marketing, IA, integrações, arquivos, financeiro
-- =========================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured',
  active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  provider text,
  status text not null default 'draft',
  budget numeric(14,2) default 0,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  metric text not null,
  target_value numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  starts_at date,
  ends_at date,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  role text,
  system_prompt text,
  status text not null default 'active',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid,
  name text not null,
  path text,
  url text,
  mime_type text,
  size_bytes bigint,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, key)
);

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_cents integer not null default 0,
  currency text not null default 'BRL',
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.billing_plans(id) on delete set null,
  status text not null default 'trial',
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key_hash text not null,
  last_used_at timestamptz,
  status text not null default 'active',
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  title text not null,
  body text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Índices
-- =========================================================
create index if not exists idx_company_members_user on public.company_members(user_id, status);
create index if not exists idx_users_profiles_company on public.users_profiles(company_id, email);
create index if not exists idx_leads_company_status on public.leads(company_id, status, created_at desc);
create index if not exists idx_leads_company_phone on public.leads(company_id, phone);
create index if not exists idx_clients_company_phone on public.clients(company_id, phone);
create index if not exists idx_tasks_company_status_due on public.tasks(company_id, status, due_at);
create index if not exists idx_opportunities_company_stage on public.opportunities(company_id, pipeline_id, stage_id, status);
create index if not exists idx_conversations_company_status on public.conversations(company_id, status, last_message_at desc);
create index if not exists idx_messages_company_conversation on public.messages(company_id, conversation_id, created_at);
create index if not exists idx_integrations_company_provider on public.integrations(company_id, provider);
create index if not exists idx_files_company on public.files(company_id, created_at desc);
create index if not exists idx_audit_company on public.audit_logs(company_id, created_at desc);

-- =========================================================
-- Triggers updated_at
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'companies','workspaces','users_profiles','company_members','roles','leads','clients','contacts','pipelines','pipeline_stages','opportunities','tasks','conversations','messages','whatsapp_instances','integrations','campaigns','goals','ai_agents','ai_knowledge_base','files','settings','billing_plans','subscriptions','api_keys'
  ] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- =========================================================
-- RLS
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'companies','workspaces','users_profiles','company_members','roles','leads','clients','contacts','pipelines','pipeline_stages','opportunities','tasks','conversations','messages','message_attachments','whatsapp_instances','integrations','campaigns','goals','ai_agents','ai_knowledge_base','files','settings','subscriptions','api_keys','audit_logs','notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Drop policies para evitar duplicidade
create or replace function public.drop_policy_if_exists(policy_name text, table_name text)
returns void language plpgsql as $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
    execute format('drop policy %I on public.%I', policy_name, table_name);
  end if;
end;
$$;

select public.drop_policy_if_exists('companies_member_access', 'companies');
create policy companies_member_access on public.companies
for all using (public.is_company_member(id)) with check (public.is_company_admin(id));

select public.drop_policy_if_exists('company_members_member_access', 'company_members');
create policy company_members_member_access on public.company_members
for select using (public.is_company_member(company_id));
select public.drop_policy_if_exists('company_members_admin_write', 'company_members');
create policy company_members_admin_write on public.company_members
for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

select public.drop_policy_if_exists('billing_plans_public_read', 'billing_plans');
create policy billing_plans_public_read on public.billing_plans
for select using (active = true);

-- Políticas genéricas por company_id para tabelas operacionais
select public.drop_policy_if_exists('tenant_select', 'workspaces');
create policy tenant_select on public.workspaces for select using (public.is_company_member(company_id));
select public.drop_policy_if_exists('tenant_write', 'workspaces');
create policy tenant_write on public.workspaces for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

select public.drop_policy_if_exists('tenant_select', 'users_profiles');
create policy tenant_select on public.users_profiles for select using (auth_user_id = auth.uid() or public.is_company_member(company_id));
select public.drop_policy_if_exists('tenant_write', 'users_profiles');
create policy tenant_write on public.users_profiles for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- Criar políticas tenant em todas as tabelas com company_id
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles','leads','clients','contacts','pipelines','pipeline_stages','opportunities','tasks','conversations','messages','message_attachments','whatsapp_instances','integrations','campaigns','goals','ai_agents','ai_knowledge_base','files','settings','subscriptions','api_keys','audit_logs','notifications'
  ] LOOP
    PERFORM public.drop_policy_if_exists('tenant_select', t);
    EXECUTE format('create policy tenant_select on public.%I for select using (public.is_company_member(company_id))', t);
    PERFORM public.drop_policy_if_exists('tenant_insert', t);
    EXECUTE format('create policy tenant_insert on public.%I for insert with check (public.is_company_member(company_id))', t);
    PERFORM public.drop_policy_if_exists('tenant_update', t);
    EXECUTE format('create policy tenant_update on public.%I for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id))', t);
    PERFORM public.drop_policy_if_exists('tenant_delete', t);
    EXECUTE format('create policy tenant_delete on public.%I for delete using (public.is_company_admin(company_id))', t);
  END LOOP;
END $$;

-- =========================================================
-- Seeds mínimos seguros
-- =========================================================
insert into public.billing_plans (slug, name, price_cents, currency, limits, active)
values
  ('starter', 'Starter', 0, 'BRL', '{"users":3,"leads":1000,"messages":1000}'::jsonb, true),
  ('business', 'Business', 0, 'BRL', '{"users":10,"leads":10000,"messages":10000}'::jsonb, true),
  ('premium', 'Premium', 0, 'BRL', '{"users":50,"leads":100000,"messages":100000}'::jsonb, true)
on conflict (slug) do update set name = excluded.name, limits = excluded.limits, active = excluded.active, updated_at = now();

-- IMPORTANTE PARA O ADMIN:
-- 1) Crie o usuário admin@r2rmarketingdigital.com.br no Supabase Auth.
-- 2) Copie o auth.users.id desse usuário.
-- 3) Execute o arquivo 03_SEED_ADMIN_EXEMPLO.sql substituindo AUTH_USER_ID_AQUI pelo UUID real.

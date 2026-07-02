-- R2R CRM SaaS — Patch de compatibilidade para bases existentes
-- Use depois do schema completo caso já existam tabelas antigas sem company_id/updated_at.

create extension if not exists pgcrypto;

-- Adiciona company_id em tabelas antigas quando necessário.
do $$
declare t text;
begin
  foreach t in array array['leads','clients','contacts','pipelines','pipeline_stages','opportunities','tasks','conversations','messages','integrations','campaigns','goals','ai_agents','ai_knowledge_base','files','settings','subscriptions','audit_logs'] loop
    if to_regclass('public.' || t) is not null then
      if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t and column_name='company_id'
      ) then
        execute format('alter table public.%I add column company_id uuid references public.companies(id) on delete cascade', t);
      end if;
      if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t and column_name='created_at'
      ) then
        execute format('alter table public.%I add column created_at timestamptz not null default now()', t);
      end if;
      if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t and column_name='updated_at'
      ) then
        execute format('alter table public.%I add column updated_at timestamptz not null default now()', t);
      end if;
    end if;
  end loop;
end $$;

-- Se houver dados antigos sem company_id, crie uma empresa padrão para migração controlada.
insert into public.companies (id, name, status, plan)
values ('00000000-0000-4000-8000-000000000100', 'Empresa Migrada R2R', 'active', 'premium')
on conflict (id) do nothing;

-- ATENÇÃO: linhas sem company_id serão vinculadas à empresa migrada.
do $$
declare t text;
begin
  foreach t in array array['leads','clients','contacts','pipelines','pipeline_stages','opportunities','tasks','conversations','messages','integrations','campaigns','goals','ai_agents','ai_knowledge_base','files','settings','subscriptions','audit_logs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set company_id = %L where company_id is null', t, '00000000-0000-4000-8000-000000000100');
    end if;
  end loop;
end $$;

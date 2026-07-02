-- R2R CRM SaaS — Seed do admin inicial
-- Antes de executar:
-- 1. Crie o usuário admin@r2rmarketingdigital.com.br em Authentication > Users.
-- 2. Copie o UUID desse usuário.
-- 3. Substitua AUTH_USER_ID_AQUI pelo UUID real.

DO $$
DECLARE
  v_company_id uuid := '00000000-0000-4000-8000-000000000001';
  v_auth_user_id uuid := 'AUTH_USER_ID_AQUI';
BEGIN
  insert into public.companies (id, name, email, status, plan)
  values (v_company_id, 'R2R Marketing Digital', 'admin@r2rmarketingdigital.com.br', 'active', 'premium')
  on conflict (id) do update set name = excluded.name, email = excluded.email, status = 'active', plan = 'premium', updated_at = now();

  insert into public.users_profiles (company_id, auth_user_id, name, email, role, status)
  values (v_company_id, v_auth_user_id, 'Administrador R2R', 'admin@r2rmarketingdigital.com.br', 'super_admin', 'active')
  on conflict (auth_user_id) do update set company_id = excluded.company_id, role = 'super_admin', status = 'active', updated_at = now();

  insert into public.company_members (company_id, user_id, role, status, permissions)
  values (v_company_id, v_auth_user_id, 'super_admin', 'active', '["*"]'::jsonb)
  on conflict (company_id, user_id) do update set role = 'super_admin', status = 'active', permissions = '["*"]'::jsonb, updated_at = now();

  insert into public.pipelines (company_id, name, status)
  values (v_company_id, 'Funil Comercial', 'active')
  on conflict do nothing;
END $$;

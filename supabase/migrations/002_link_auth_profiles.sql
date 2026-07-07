-- R2R CRM SaaS - vinculo de perfis Supabase Auth
-- Execute depois de criar o usuario no Supabase Auth e aplicar 001_schema.sql.
-- Corrige o caso: login autentica, mas public.usuarios.auth_user_id esta vazio.

update public.usuarios u
set auth_user_id = au.id,
    updated_at = now()
from auth.users au
where u.auth_user_id is null
  and lower(u.email) = lower(au.email)
  and not exists (
    select 1
    from public.usuarios duplicated
    where duplicated.auth_user_id = au.id
      and duplicated.id <> u.id
  );

-- Verificacao: deve retornar o admin com auth_user_id preenchido.
select id, empresa_id, nome, email, tipo_usuario, status, auth_user_id
from public.usuarios
where lower(email) = lower('admin@r2rmarketingdigital.com.br');

# Supabase - R2R CRM

Ordem de importacao:

1. Execute `migrations/001_schema.sql` no SQL Editor do Supabase.
2. Crie o usuario administrador no Supabase Auth.
3. Ajuste o e-mail em `seed.sql`, se necessario.
4. Execute `seed.sql`.

O arquivo de migration cria tabelas multiempresa, RLS, indices, triggers de `updated_at` e a view `public.dashboard_resumo`.


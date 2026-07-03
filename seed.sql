-- Seed demo opcional.
-- Crie primeiro um usuario no Supabase Auth com o e-mail admin@r2rmarketingdigital.com.br
-- ou altere o e-mail abaixo para o seu usuario real.

insert into public.empresas (id, nome, slug, email, nicho, status, plano_id, nome_sistema, cor_primaria)
values (
  '00000000-0000-4000-8000-000000000001',
  'Empresa Demo',
  'empresa-demo',
  'admin@r2rmarketingdigital.com.br',
  'marketing_digital',
  'ativo',
  'business',
  'R2R CRM IA',
  '#7c3aed'
)
on conflict (id) do update set nome = excluded.nome, updated_at = now();

insert into public.usuarios (empresa_id, nome, email, funcao, tipo_usuario, status, permissoes)
values (
  '00000000-0000-4000-8000-000000000001',
  'Admin Demo',
  'admin@r2rmarketingdigital.com.br',
  'Administrador',
  'super_admin',
  'ativo',
  '{"all":true}'::jsonb
)
on conflict (empresa_id, email) do update set
  tipo_usuario = excluded.tipo_usuario,
  status = excluded.status,
  updated_at = now();

insert into public.funis (id, empresa_id, nome, nicho, tipo, padrao, ordem)
values (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000001',
  'Funil Marketing Digital',
  'marketing_digital',
  'vendas',
  true,
  1
)
on conflict (id) do update set updated_at = now();

insert into public.funil_etapas (empresa_id, funil_id, nome, cor, ordem, probabilidade, sla_horas, etapa_ganha, etapa_perdida)
select
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000020',
  etapa.nome,
  etapa.cor,
  etapa.ordem,
  etapa.probabilidade,
  etapa.sla_horas,
  etapa.etapa_ganha,
  etapa.etapa_perdida
from (
  values
  ('Novo Lead','#3b82f6',1,5,4,false,false),
  ('Primeiro Contato','#06b6d4',2,15,8,false,false),
  ('Diagnostico','#7c3aed',3,25,24,false,false),
  ('Qualificado','#f97316',4,40,24,false,false),
  ('Reuniao Agendada','#eab308',5,55,48,false,false),
  ('Proposta Enviada','#f59e0b',6,70,72,false,false),
  ('Negociacao','#ec4899',7,80,72,false,false),
  ('Contrato Enviado','#10b981',8,90,72,false,false),
  ('Fechado/Ganho','#22c55e',9,100,null,true,false),
  ('Perdido','#ef4444',10,0,null,false,true),
  ('Follow-up Futuro','#64748b',11,20,168,false,false)
) as etapa(nome, cor, ordem, probabilidade, sla_horas, etapa_ganha, etapa_perdida)
on conflict do nothing;

insert into public.fontes_lead (empresa_id, nome, grupo)
values
('00000000-0000-4000-8000-000000000001','Manual','manual'),
('00000000-0000-4000-8000-000000000001','Meta Lead Ads','trafego_pago'),
('00000000-0000-4000-8000-000000000001','WhatsApp','mensageria'),
('00000000-0000-4000-8000-000000000001','Formulario Site','site'),
('00000000-0000-4000-8000-000000000001','Webhook/N8N','api')
on conflict (empresa_id, nome) do nothing;

insert into public.leads (empresa_id, nome, telefone, email, empresa, cidade, estado, nicho, interesse, origem_lead, origem_nome, midia, campanha, utm_source, utm_medium, utm_campaign, etapa, status, temperatura, score, valor, tags, notas)
values
('00000000-0000-4000-8000-000000000001','Lead Demo Quente','+55 47 99999-0000','lead@demo.local','Negocio Demo','Joinville','SC','servicos','Gestao de trafego','meta_ads','Meta Lead Ads','paid_social','Campanha Demo','facebook','paid_social','campanha-demo','Novo Lead','novo','quente',82,2500,'["demo","meta"]','Lead criado pelo seed demo.')
on conflict do nothing;

// R2R CRM SaaS - configuracao publica do frontend.
// Nunca coloque aqui service_role, OpenAI key, Evolution key, Meta token,
// N8N key ou qualquer segredo. No navegador ficam apenas URLs publicas.

window.R2R_CONFIG = Object.assign({
  API_BASE_URL: 'https://api.r2rmarketingdigital.com.br',
  APP_NAME: 'R2R CRM',
  ENV: 'production',
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: ''
}, window.R2R_CONFIG || {});

window.R2R_ADMIN_EMAIL = window.R2R_ADMIN_EMAIL || 'admin@r2rmarketingdigital.com.br';
window.R2R_SUPABASE_URL = window.R2R_SUPABASE_URL || window.R2R_CONFIG.SUPABASE_URL || '';
window.R2R_SUPABASE_PUBLISHABLE_KEY = window.R2R_SUPABASE_PUBLISHABLE_KEY || window.R2R_CONFIG.SUPABASE_PUBLISHABLE_KEY || '';
window.R2R_SUPABASE_ANON_KEY = window.R2R_SUPABASE_ANON_KEY || window.R2R_SUPABASE_PUBLISHABLE_KEY;
var r2rStoredApiBase = '';
try { r2rStoredApiBase = localStorage.getItem('r2r_api_base') || ''; } catch (e) {}
window.R2R_API_BASE = (window.R2R_API_BASE || window.R2R_CONFIG.API_BASE_URL || r2rStoredApiBase || '').replace(/\/$/, '');
window.R2R_REAL_MODE = true;

try {
  if (window.R2R_SUPABASE_URL) localStorage.setItem('r2r_sb_url', window.R2R_SUPABASE_URL);
  if (window.R2R_SUPABASE_ANON_KEY) localStorage.setItem('r2r_sb_anon_key', window.R2R_SUPABASE_ANON_KEY);
  if (window.R2R_API_BASE) localStorage.setItem('r2r_api_base', window.R2R_API_BASE);
} catch (e) {}

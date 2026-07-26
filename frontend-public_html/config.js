// R2R CRM SaaS - configuracao publica do frontend.
// Nunca coloque aqui service_role, OpenAI key, Evolution key, Meta token,
// N8N key ou qualquer segredo. No navegador ficam apenas URLs publicas.

window.R2R_CONFIG = Object.assign({
  API_BASE_URL: '',
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

function r2rCleanApiBase(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function r2rDefaultApiBase() {
  try {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.protocol + '//' + host + ':3000';
    }
    return window.location.origin;
  } catch (e) {
    return '';
  }
}

function r2rIgnoreKnownBrokenApiBase(value) {
  try {
    var host = new URL(value).hostname;
    return host === 'api.r2rmarketingdigital.com.br';
  } catch (e) {
    return false;
  }
}

var r2rConfiguredApiBase = r2rCleanApiBase(window.R2R_API_BASE || window.R2R_CONFIG.API_BASE_URL || '');
if (!r2rConfiguredApiBase && r2rIgnoreKnownBrokenApiBase(r2rStoredApiBase)) {
  r2rStoredApiBase = '';
  try { localStorage.removeItem('r2r_api_base'); } catch (e) {}
}
window.R2R_API_BASE = r2rConfiguredApiBase || r2rCleanApiBase(r2rStoredApiBase) || r2rDefaultApiBase();
window.R2R_REAL_MODE = true;

(function r2rLoadEvolutionRuntimeFix() {
  var src = 'assets/r2r-evolution-runtime-fix.js?v=20260726-backend-origin';
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[src*="r2r-evolution-runtime-fix.js"]')) return;

  function appendScript() {
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  if (document.head || document.documentElement) appendScript();
  else document.addEventListener('DOMContentLoaded', appendScript, { once: true });
})();

try {
  if (window.R2R_SUPABASE_URL) localStorage.setItem('r2r_sb_url', window.R2R_SUPABASE_URL);
  if (window.R2R_SUPABASE_ANON_KEY) localStorage.setItem('r2r_sb_anon_key', window.R2R_SUPABASE_ANON_KEY);
  if (window.R2R_API_BASE) localStorage.setItem('r2r_api_base', window.R2R_API_BASE);
} catch (e) {}

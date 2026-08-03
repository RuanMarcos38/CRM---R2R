// R2R CRM SaaS - configuração pública do frontend.
// Nunca coloque aqui service_role, OpenAI key, Evolution key, Meta token,
// N8N key ou qualquer segredo. No navegador ficam apenas URLs públicas.

(function initializeR2RConfig(global) {
  'use strict';

  var SUPABASE_URL =
    'https://uwzfgksmnqgaxtscwxow.supabase.co';

  var SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_mZUNYHM3JeRZXR8vWfVECA_7gCgTp7i';

  var API_BASE_URL =
    'https://api.r2rmarketingdigital.com.br';

  global.R2R_ALLOW_API_SUBDOMAIN = true;

  global.R2R_CONFIG = Object.assign(
    {},
    global.R2R_CONFIG || {},
    {
      API_BASE_URL: API_BASE_URL,
      APP_NAME: 'R2R CRM',
      ENV: 'production',
      SUPABASE_URL: SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY
    }
  );

  global.R2R_ADMIN_EMAIL =
    global.R2R_ADMIN_EMAIL ||
    'admin@r2rmarketingdigital.com.br';

  global.R2R_SUPABASE_URL =
    SUPABASE_URL;

  global.R2R_SUPABASE_PUBLISHABLE_KEY =
    SUPABASE_PUBLISHABLE_KEY;

  global.R2R_SUPABASE_ANON_KEY =
    SUPABASE_PUBLISHABLE_KEY;

  global.R2R_API_BASE =
    cleanUrl(API_BASE_URL);

  global.R2R_REAL_MODE = true;

  persistPublicConfig();
  loadEvolutionRuntimeFix();

  console.log('[R2R CONFIG]', {
    apiBase: global.R2R_API_BASE,
    supabaseUrl: global.R2R_SUPABASE_URL,
    supabaseConfigured: Boolean(
      global.R2R_SUPABASE_PUBLISHABLE_KEY
    )
  });

  function cleanUrl(value) {
    return String(value || '')
      .trim()
      .replace(/\/+$/, '');
  }

  function persistPublicConfig() {
    try {
      localStorage.setItem(
        'r2r_sb_url',
        global.R2R_SUPABASE_URL
      );

      localStorage.setItem(
        'r2r_sb_anon_key',
        global.R2R_SUPABASE_ANON_KEY
      );

      localStorage.setItem(
        'r2r_api_base',
        global.R2R_API_BASE
      );
    } catch (error) {
      console.warn(
        '[R2R CONFIG] Não foi possível salvar a configuração local.',
        error
      );
    }
  }

  function loadEvolutionRuntimeFix() {
    if (typeof document === 'undefined') {
      return;
    }

    if (
      document.querySelector(
        'script[src*="r2r-evolution-runtime-fix.js"]'
      )
    ) {
      return;
    }

    var source =
      'assets/r2r-evolution-runtime-fix.js' +
      '?v=20260803-supabase-final';

    function appendScript() {
      var target =
        document.head ||
        document.documentElement;

      if (!target) {
        return;
      }

      var script =
        document.createElement('script');

      script.async = false;
      script.src = source;

      script.onerror = function () {
        console.error(
          '[R2R CONFIG] Falha ao carregar:',
          source
        );
      };

      target.appendChild(script);
    }

    if (
      document.head ||
      document.documentElement
    ) {
      appendScript();
      return;
    }

    document.addEventListener(
      'DOMContentLoaded',
      appendScript,
      { once: true }
    );
  }
})(window);
const fs = require('fs');
const path = require('path');

const BILLING_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price_cents: 79000,
    users_limit: 3,
    leads_limit: 1000,
    description: 'Ate 3 usuarios, 1 funil, 1.000 leads e atendimento basico.'
  },
  business: {
    id: 'business',
    name: 'Business',
    price_cents: 150000,
    users_limit: 10,
    leads_limit: 10000,
    description: 'Funis ilimitados, automacoes, IA comercial, Meta Ads e webhooks.'
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price_cents: 320000,
    users_limit: null,
    leads_limit: null,
    description: 'White label, API publica, integracoes avancadas e suporte prioritario.'
  }
};

function normalizePlanId(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['starter', 'start', 'inicial', 'basico'].includes(v)) return 'starter';
  if (['business', 'busines', 'negocios', 'profissional'].includes(v)) return 'business';
  if (['premium', 'enterprise', 'ilimitado'].includes(v)) return 'premium';
  return null;
}

function envFirst(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function checkoutUrlForPlan(planId) {
  const upper = String(planId || '').toUpperCase();
  return envFirst([
    `CHECKOUT_${upper}_URL`,
    `PAYMENT_${upper}_URL`,
    `KIWIFY_${upper}_URL`,
    `ASAAS_${upper}_URL`,
    `MERCADOPAGO_${upper}_URL`,
    `STRIPE_${upper}_URL`
  ]);
}

function whatsappCheckoutFallback(plan, customer = {}) {
  const phone = String(process.env.PAYMENT_WHATSAPP || process.env.SALES_WHATSAPP || '').replace(/\D/g, '');
  if (!phone) return '';
  const price = (plan.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const msg = [
    'Ola, quero assinar o R2R CRM IA.',
    `Plano: ${plan.name}`,
    `Valor: ${price}/mes`,
    customer.name ? `Responsavel: ${customer.name}` : '',
    customer.email ? `E-mail: ${customer.email}` : '',
    customer.company ? `Empresa: ${customer.company}` : ''
  ].filter(Boolean).join('\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function publicBillingPlans() {
  return Object.values(BILLING_PLANS).map(plan => ({
    ...plan,
    checkout_configured: !!checkoutUrlForPlan(plan.id)
  }));
}

function saveBillingWebhookLog(payload) {
  try {
    const dir = process.env.BILLING_LOG_DIR || path.join(process.cwd(), '.data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'billing-webhooks.jsonl'), JSON.stringify({ at: new Date().toISOString(), payload }) + '\n');
  } catch (error) {
    console.warn('[billing]', error.message);
  }
}

module.exports = { BILLING_PLANS, normalizePlanId, checkoutUrlForPlan, whatsappCheckoutFallback, publicBillingPlans, saveBillingWebhookLog };

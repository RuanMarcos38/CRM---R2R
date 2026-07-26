#!/usr/bin/env node

import https from 'node:https';

const hostname = process.env.R2R_API_HOST || 'crm.r2rmarketingdigital.com.br';
const healthPath = process.env.R2R_HEALTH_PATH || '/api/health';
const timeoutMs = Number(process.env.R2R_CHECK_TIMEOUT_MS || 10000);
const family = Number(process.env.R2R_CHECK_IP_FAMILY || 4) || undefined;

function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname,
      port: 443,
      path: healthPath,
      family,
      servername: hostname,
      rejectUnauthorized: true,
      timeout: timeoutMs,
      headers: { Accept: 'application/json' }
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const contentType = String(res.headers['content-type'] || '');
        let json = null;
        try { json = JSON.parse(body); } catch {}
        const socket = res.socket || {};
        const cert = typeof socket.getPeerCertificate === 'function' ? socket.getPeerCertificate() : {};
        resolve({
          certificate: {
            authorized: socket.authorized !== false,
            authorizationError: socket.authorizationError || null,
            subject: cert && cert.subject,
            issuer: cert && cert.issuer,
            validFrom: cert && cert.valid_from,
            validTo: cert && cert.valid_to,
            fingerprint256: cert && cert.fingerprint256
          },
          health: {
            statusCode: res.statusCode,
            contentType,
            json,
            sample: body.slice(0, 300),
            looksLikeFrontend: /<!DOCTYPE html|<html/i.test(body)
          }
        });
      });
    });
    req.once('timeout', () => req.destroy(new Error('HTTPS timeout')));
    req.once('error', reject);
  });
}

try {
  const { certificate, health } = await checkHealth();
  const ok = health.statusCode === 200 && health.json?.ok === true;
  console.log(JSON.stringify({ ok, hostname, family, certificate, health }, null, 2));
  if (!ok) {
    if (health.looksLikeFrontend) {
      console.error('Production route returned frontend HTML instead of backend JSON. Check EasyPanel domain, service port and Hostinger/CDN cache.');
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, hostname, error: error.message, code: error.code || null }, null, 2));
  process.exitCode = 1;
}

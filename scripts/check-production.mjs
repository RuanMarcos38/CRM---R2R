#!/usr/bin/env node

import tls from 'node:tls';
import https from 'node:https';

const hostname = process.env.R2R_API_HOST || 'api.r2rmarketingdigital.com.br';
const healthPath = process.env.R2R_HEALTH_PATH || '/api/health';
const timeoutMs = Number(process.env.R2R_CHECK_TIMEOUT_MS || 10000);

function checkCertificate() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ hostname, port: 443, servername: hostname, rejectUnauthorized: true });
    socket.setTimeout(timeoutMs);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      resolve({
        authorized: socket.authorized,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint256: cert.fingerprint256
      });
      socket.end();
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS timeout')));
    socket.once('error', reject);
  });
}

function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname, port: 443, path: healthPath, timeout: timeoutMs, headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const contentType = String(res.headers['content-type'] || '');
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ statusCode: res.statusCode, contentType, json, sample: body.slice(0, 300) });
      });
    });
    req.once('timeout', () => req.destroy(new Error('HTTPS timeout')));
    req.once('error', reject);
  });
}

try {
  const certificate = await checkCertificate();
  const health = await checkHealth();
  console.log(JSON.stringify({ ok: health.statusCode === 200 && health.json?.ok === true, hostname, certificate, health }, null, 2));
  if (health.statusCode !== 200 || health.json?.ok !== true) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, hostname, error: error.message, code: error.code || null }, null, 2));
  process.exitCode = 1;
}

#!/usr/bin/env node

import https from 'node:https';

const hostname = process.env.R2R_API_HOST || 'crm.r2rmarketingdigital.com.br';
const healthPath = process.env.R2R_HEALTH_PATH || '/api/health';
const timeoutMs = Number(process.env.R2R_CHECK_TIMEOUT_MS || 10000);
const family = Number(process.env.R2R_CHECK_IP_FAMILY || 4) || undefined;
const expectedRelease = process.env.R2R_EXPECTED_RELEASE || '2026.08.06-new-crm';
const expectedFrontendMarker = 'R2R CRM — CRM de vendas e atendimento multiempresa';
const oldFrontendMarkers = ['R2R CRM IA — Marketing Digital', 'Sites, tráfego pago e'];

function requestPath(pathname, accept) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname,
      port: 443,
      path: pathname,
      family,
      servername: hostname,
      rejectUnauthorized: true,
      timeout: timeoutMs,
      headers: { Accept: accept }
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
          statusCode: res.statusCode,
          contentType,
          headers: res.headers,
          json,
          body,
          sample: body.slice(0, 300),
          certificate: {
            authorized: socket.authorized !== false,
            authorizationError: socket.authorizationError || null,
            subject: cert && cert.subject,
            issuer: cert && cert.issuer,
            validFrom: cert && cert.valid_from,
            validTo: cert && cert.valid_to,
            fingerprint256: cert && cert.fingerprint256
          }
        });
      });
    });
    req.once('timeout', () => req.destroy(new Error('HTTPS timeout')));
    req.once('error', reject);
  });
}

try {
  const [healthResponse, frontendResponse] = await Promise.all([
    requestPath(healthPath, 'application/json'),
    requestPath('/', 'text/html,application/xhtml+xml')
  ]);
  const healthOk = healthResponse.statusCode === 200 &&
    healthResponse.json?.ok === true &&
    healthResponse.json?.frontend_release === expectedRelease;
  const frontendBody = frontendResponse.body || '';
  const frontendOk = frontendResponse.statusCode === 200 &&
    frontendBody.includes(expectedFrontendMarker) &&
    oldFrontendMarkers.every(marker => !frontendBody.includes(marker)) &&
    String(frontendResponse.headers['x-r2r-release'] || '') === expectedRelease;
  const ok = healthOk && frontendOk;
  const result = {
    ok,
    hostname,
    family,
    expectedRelease,
    certificate: healthResponse.certificate,
    health: {
      ok: healthOk,
      statusCode: healthResponse.statusCode,
      contentType: healthResponse.contentType,
      json: healthResponse.json,
      sample: healthResponse.sample
    },
    frontend: {
      ok: frontendOk,
      statusCode: frontendResponse.statusCode,
      contentType: frontendResponse.contentType,
      releaseHeader: frontendResponse.headers['x-r2r-release'] || null,
      hasExpectedMarker: frontendBody.includes(expectedFrontendMarker),
      oldMarkersFound: oldFrontendMarkers.filter(marker => frontendBody.includes(marker)),
      sample: frontendResponse.sample
    }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!ok) {
    if (/<!DOCTYPE html|<html/i.test(healthResponse.body)) {
      console.error('Production route returned frontend HTML instead of backend JSON. Check EasyPanel domain, service port and Hostinger/CDN cache.');
    }
    if (!frontendOk) {
      console.error('Production still serves the wrong frontend release or does not expose the expected release header.');
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, hostname, error: error.message, code: error.code || null }, null, 2));
  process.exitCode = 1;
}

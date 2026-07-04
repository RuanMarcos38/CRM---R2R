const fs = require('fs');
const path = require('path');
const { corsHeaders, securityHeaders } = require('./security');
const { numberEnv } = require('./env');

function jsonLimit() {
  return numberEnv('JSON_BODY_LIMIT_BYTES', 2_000_000);
}

function cleanUrl(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url) && /^[A-Za-z0-9.-]+(?::\d+)?(\/|$)/.test(url)) {
    url = /^(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(url) ? `http://${url}` : `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    req.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > jsonLimit()) {
        const err = new Error('Payload muito grande.');
        err.statusCode = 413;
        req.destroy(err);
        reject(err);
      }
    });
    req.on('end', () => {
      if (!buffer) return resolve({});
      try {
        resolve(JSON.parse(buffer));
      } catch (_) {
        if (String(req.headers['content-type'] || '').includes('application/json')) {
          const err = new Error('JSON invalido.');
          err.statusCode = 400;
          reject(err);
          return;
        }
        resolve({ raw: buffer });
      }
    });
    req.on('error', reject);
  });
}

function sendJson(req, res, status, data, headers = {}) {
  const reqOrigin = req.headers.origin;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(reqOrigin),
    ...securityHeaders(),
    ...headers
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(req, res, status, text, headers = {}) {
  const reqOrigin = req.headers.origin;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...corsHeaders(reqOrigin),
    ...securityHeaders(),
    ...headers
  });
  res.end(text);
}

function serveFile(req, res, filePath) {
  const reqOrigin = req.headers.origin;
  res.writeHead(200, {
    'Content-Type': contentType(filePath),
    ...corsHeaders(reqOrigin),
    ...securityHeaders()
  });
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { readBody, sendJson, sendText, serveFile, cleanUrl, contentType };

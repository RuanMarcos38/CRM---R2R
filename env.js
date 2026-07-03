const fs = require('fs');
const path = require('path');

function loadEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(raw).trim().toLowerCase());
}

function numberEnv(name, defaultValue) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : defaultValue;
}

function listEnv(name, defaultValue = []) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}

module.exports = { loadEnv, boolEnv, numberEnv, listEnv };

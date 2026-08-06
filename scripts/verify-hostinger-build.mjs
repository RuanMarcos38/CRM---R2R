#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const buildDir = path.resolve(process.argv[2] || "frontend-public_html");
const routes = [
  "",
  "auth",
  "onboarding",
  "sem-acesso",
  "reset-password",
  "dashboard",
  "funil",
  "clientes",
  "tarefas",
  "conversas",
  "whatsapp",
  "ligacoes",
  "meta-ads",
  "bot",
  "acessos",
  "equipe",
  "configuracoes",
  "relatorios",
  "financeiro",
  "contratos",
  "propostas",
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    else files.push(absolute);
  }

  return files;
}

async function assertFile(relativePath) {
  await access(path.join(buildDir, relativePath));
}

for (const required of ["index.html", ".htaccess", "serverfn-proxy.php", "favicon.ico"]) {
  await assertFile(required);
}

for (const route of routes) {
  await assertFile(route ? path.join(route, "index.html") : "index.html");
}

const files = await listFiles(buildDir);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const jsFiles = files.filter((file) => file.endsWith(".js"));
const missing = new Set();

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  if (!html.includes("R2R CRM")) throw new Error(`HTML inesperado: ${htmlFile}`);
  if (html.includes("/~flock.js")) throw new Error(`Analytics Lovable não removido: ${htmlFile}`);

  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+|\/favicon\.ico)"/g)) {
    const target = path.join(buildDir, match[1].slice(1));
    try {
      await access(target);
    } catch {
      missing.add(match[1]);
    }
  }
}

for (const jsFile of jsFiles) {
  const javascript = await readFile(jsFile, "utf8");
  for (const match of javascript.matchAll(/(?:from|import\()\s*[(`]?['"`](\.\/[^'"`]+)['"`]/g)) {
    const target = path.resolve(path.dirname(jsFile), match[1]);
    try {
      await access(target);
    } catch {
      missing.add(path.relative(buildDir, target));
    }
  }
}

if (missing.size > 0) {
  throw new Error(`Referências ausentes:\n${[...missing].sort().join("\n")}`);
}

const htaccess = await readFile(path.join(buildDir, ".htaccess"), "utf8");
if (!htaccess.includes("serverfn-proxy.php") || !htaccess.includes("RewriteRule ^ index.html")) {
  throw new Error("O .htaccess não contém as regras obrigatórias.");
}

const proxy = await readFile(path.join(buildDir, "serverfn-proxy.php"), "utf8");
if (!proxy.includes("salesignite-ops.lovable.app") || !proxy.includes("^[a-f0-9]{64}$")) {
  throw new Error("O proxy das funções de servidor não está restrito ao projeto esperado.");
}

console.log(
  JSON.stringify(
    {
      build: buildDir,
      routes: routes.length,
      html: htmlFiles.length,
      javascript: jsFiles.length,
      files: files.length,
      status: "ok",
    },
    null,
    2,
  ),
);

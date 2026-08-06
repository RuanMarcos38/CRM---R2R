#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceOrigin = "https://salesignite-ops.lovable.app";
const outputDir = path.resolve(process.argv[2] || "frontend-public_html");

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

const assetPattern = /(?:\/?assets\/[A-Za-z0-9_./-]+\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?|ttf))/g;
const pendingAssets = new Set();
const downloadedAssets = new Set();

async function request(relativeUrl) {
  const url = new URL(relativeUrl, sourceOrigin);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/javascript,text/css,*/*;q=0.8",
      "User-Agent": "R2R-CRM-Hostinger-Builder/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url.pathname}: HTTP ${response.status}`);
  }

  return response;
}

function discoverAssets(content) {
  for (const match of content.matchAll(assetPattern)) {
    const relativePath = match[0].replace(/^\//, "");
    if (!downloadedAssets.has(relativePath)) pendingAssets.add(relativePath);
  }
}

function normalizeHtml(html) {
  return html
    .replaceAll("\u0000", "\\u0000")
    .replace('<html lang="en">', '<html lang="pt-BR">')
    .replace(/<script[^>]+src="\/~flock\.js"[^>]*><\/script>/g, "")
    .replace(/<meta name="author" content="Lovable"\s*\/?>(?:<\/meta>)?/g, "")
    .replace(/<meta name="twitter:site" content="@Lovable"\s*\/?>(?:<\/meta>)?/g, "");
}

async function saveRoute(route) {
  const routePath = route ? `/${route}` : "/";
  const response = await request(routePath);
  const html = normalizeHtml(await response.text());
  discoverAssets(html);

  const destination = route
    ? path.join(outputDir, route, "index.html")
    : path.join(outputDir, "index.html");

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, "utf8");
}

async function saveAsset(relativePath) {
  pendingAssets.delete(relativePath);
  if (downloadedAssets.has(relativePath)) return;

  const response = await request(`/${relativePath}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const destination = path.join(outputDir, relativePath);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  downloadedAssets.add(relativePath);

  if (/\.(?:js|css)$/.test(relativePath)) {
    discoverAssets(bytes.toString("utf8"));
  }
}

const htaccess = `# R2R CRM — pacote estático Hostinger
DirectoryIndex index.html
Options -Indexes

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Mantém as funções de servidor do build Lovable funcionando na Hostinger.
  RewriteRule ^_serverFn/([a-f0-9]{64})$ serverfn-proxy.php?path=$1 [END,QSA]

  # Mantém arquivos e páginas pré-renderizadas acessíveis.
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Rotas do CRM são resolvidas pelo aplicativo React.
  RewriteRule ^ index.html [L]
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>

  <FilesMatch "\\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>

ErrorDocument 404 /index.html
`;

const serverFnProxy = `<?php
declare(strict_types=1);

// Proxy restrito às funções do build publicado do R2R CRM.
// Ele evita CORS e não aceita URLs arbitrárias.
const R2R_LOVABLE_ORIGIN = 'https://salesignite-ops.lovable.app';

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'A extensão PHP cURL precisa estar ativa na Hostinger.']);
    exit;
}

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST'));
$functionId = (string) ($_GET['path'] ?? '');

if (!str_starts_with($requestUri, '/_serverFn/') || !preg_match('/^[a-f0-9]{64}$/', $functionId)) {
    http_response_code(404);
    exit;
}

if (!in_array($method, ['GET', 'POST'], true)) {
    http_response_code(405);
    header('Allow: GET, POST');
    exit;
}

$userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? 'Mozilla/5.0 R2R-CRM-Hostinger');
$cookieFile = tempnam(sys_get_temp_dir(), 'r2r_lovable_');

if ($cookieFile === false) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Não foi possível iniciar a conexão segura com o CRM.']);
    exit;
}

try {
    // Obtém o cookie técnico do Cloudflare antes de chamar a função protegida.
    $bootstrap = curl_init(R2R_LOVABLE_ORIGIN . '/');
    curl_setopt_array($bootstrap, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_USERAGENT => $userAgent,
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml'],
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    curl_exec($bootstrap);
    $bootstrapError = curl_errno($bootstrap);
    curl_close($bootstrap);

    if ($bootstrapError !== 0) {
        throw new RuntimeException('Falha ao iniciar a conexão com o CRM.');
    }

    $incomingHeaders = function_exists('getallheaders') ? getallheaders() : [];
    $forwardHeaders = [
        'Accept: ' . (string) ($incomingHeaders['Accept'] ?? $_SERVER['HTTP_ACCEPT'] ?? 'application/json'),
        'Content-Type: ' . (string) ($incomingHeaders['Content-Type'] ?? $_SERVER['CONTENT_TYPE'] ?? 'application/json'),
        'Origin: ' . R2R_LOVABLE_ORIGIN,
        'Referer: ' . R2R_LOVABLE_ORIGIN . '/',
        'X-Tsr-ServerFn: true',
    ];

    $authorization = (string) ($incomingHeaders['Authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if ($authorization !== '') {
        $forwardHeaders[] = 'Authorization: ' . $authorization;
    }

    $responseHeaders = [];
    $upstream = curl_init(R2R_LOVABLE_ORIGIN . '/_serverFn/' . $functionId);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_USERAGENT => $userAgent,
        CURLOPT_HTTPHEADER => $forwardHeaders,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
            $length = strlen($line);
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return $length;
        },
    ];

    if ($method === 'POST') {
        $options[CURLOPT_POSTFIELDS] = file_get_contents('php://input') ?: '';
    }

    curl_setopt_array($upstream, $options);
    $body = curl_exec($upstream);
    $status = (int) curl_getinfo($upstream, CURLINFO_RESPONSE_CODE);
    $error = curl_error($upstream);
    curl_close($upstream);

    if ($body === false) {
        throw new RuntimeException($error !== '' ? $error : 'Falha ao consultar a função do CRM.');
    }

    http_response_code($status > 0 ? $status : 502);
    foreach (['content-type', 'cache-control', 'x-tss-serialized', 'x-tss-raw'] as $name) {
        if (isset($responseHeaders[$name])) {
            header($name . ': ' . $responseHeaders[$name]);
        }
    }
    echo $body;
} catch (Throwable $error) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Não foi possível conectar às funções do CRM.']);
} finally {
    @unlink($cookieFile);
}
`;

const deploymentReadme = `# R2R CRM — pacote para Hostinger

Este diretório contém o build estático do CRM publicado em:

- https://salesignite-ops.lovable.app

## Instalação

1. Abra a pasta \`public_html\` do subdomínio \`crm.r2rmarketingdigital.com.br\`.
2. Remova ou mova para backup os arquivos da versão antiga.
3. Envie **o conteúdo deste diretório**, sem criar uma pasta adicional.
4. Confirme que \`index.html\`, \`.htaccess\`, \`serverfn-proxy.php\`, \`favicon.ico\` e \`assets/\` ficaram diretamente em \`public_html\`.
5. Limpe o cache da Hostinger e abra \`https://crm.r2rmarketingdigital.com.br/?v=novo-crm\`.

## Observação

As páginas públicas e as principais rotas foram pré-renderizadas. O \`.htaccess\` mantém o fallback do aplicativo React para rotas dinâmicas e direciona as funções protegidas ao \`serverfn-proxy.php\`. A extensão PHP cURL deve estar ativa (ela vem habilitada nos planos comuns da Hostinger).
`;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const route of routes) await saveRoute(route);

while (pendingAssets.size > 0) {
  const batch = [...pendingAssets];
  for (const asset of batch) await saveAsset(asset);
}

const faviconResponse = await request("/favicon.ico");
await writeFile(
  path.join(outputDir, "favicon.ico"),
  Buffer.from(await faviconResponse.arrayBuffer()),
);

await writeFile(path.join(outputDir, ".htaccess"), htaccess, "utf8");
await writeFile(path.join(outputDir, "serverfn-proxy.php"), serverFnProxy, "utf8");
await writeFile(path.join(outputDir, "README_HOSTINGER.md"), deploymentReadme, "utf8");

console.log(
  JSON.stringify(
    {
      source: sourceOrigin,
      output: outputDir,
      routes: routes.length,
      assets: downloadedAssets.size,
    },
    null,
    2,
  ),
);

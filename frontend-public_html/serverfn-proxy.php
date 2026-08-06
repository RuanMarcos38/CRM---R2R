<?php
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

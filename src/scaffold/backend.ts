import path from "node:path";
import { atomicWrite } from "../utils/fs.js";

export function generatePhpConfig(): string {
  return `<?php
/**
 * Mozole Studio - Production Backend Configuration
 * Pure PHP 8.1+ Zero-Dependency Runtime
 */
defined('MOZOLE_SECURE') or die(json_encode(['error' => 'Direct access prohibited']));

return [
    // Recipients
    'mail_to' => 'info@mozole.studio',
    'mail_subject_prefix' => '[Mozole Contact] ',
    
    // Allowed frontend origins for CORS and Referer verification
    'allowed_origins' => [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://mozole.studio',
    ],

    // Security & Rate Limiting
    'rate_limit' => [
        'max_requests' => 5,       // Max requests
        'window_seconds' => 300,   // Per 5 minutes
        'storage_dir' => sys_get_temp_dir() . '/mozole_rate_limits',
    ],

    // Honeypot field name (must remain empty on legitimate submissions)
    'honeypot_field' => '_mozole_website_url',
];
`;
}

export function generatePhpMailer(): string {
  return `<?php
defined('MOZOLE_SECURE') or die(json_encode(['error' => 'Direct access prohibited']));

function mozole_send_mail(array $config, string $fromEmail, string $name, string $subject, string $body): bool {
    $to = filter_var($config['mail_to'], FILTER_VALIDATE_EMAIL);
    if (!$to) return false;
    $cleanSubject = $config['mail_subject_prefix'] . str_replace(["\\r", "\\n", "\\0"], '', $subject);
    
    // Prevent email header injection
    $cleanFromEmail = filter_var($fromEmail, FILTER_VALIDATE_EMAIL);
    if (!$cleanFromEmail) {
        return false;
    }
    $cleanName = str_replace(["\\r", "\\n", "\\0"], '', $name);

    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/html; charset=UTF-8';
    $headers[] = 'From: ' . sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($cleanName), $cleanFromEmail);
    $headers[] = 'Reply-To: ' . $cleanFromEmail;
    $headers[] = 'X-Mailer: MozoleStudioPurePHP/2.0';

    $htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: sans-serif; line-height: 1.6; color: #111;">'
        . '<h2>New Message via Website Contact Form</h2>'
        . '<p><strong>Name:</strong> ' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><strong>Email:</strong> ' . htmlspecialchars($cleanFromEmail, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<p><strong>Subject:</strong> ' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</p>'
        . '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />'
        . '<p style="white-space: pre-wrap;">' . nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8')) . '</p>'
        . '</body></html>';

    return mail($to, '=?UTF-8?B?' . base64_encode($cleanSubject) . '?=', $htmlContent, implode("\\r\\n", $headers));
}
`;
}

export function generatePhpIndex(): string {
  return `<?php
/**
 * Mozole Studio - API Front Controller
 * Pure PHP 8.1+ Zero-Dependency Runtime
 */
define('MOZOLE_SECURE', true);
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';

// 1. CORS Verification
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$isAllowedOrigin = in_array($origin, $config['allowed_origins'], true);

if ($isAllowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: POST, OPTIONS, GET');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
}

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Health check endpoint
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    http_response_code(200);
    echo json_encode([
        'status' => 'operational',
        'service' => 'Mozole Studio API',
        'php_version' => PHP_VERSION,
        'timestamp' => time(),
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// 2. Require a trusted Origin, or a full-origin Referer when Origin is absent.
function mozole_origin(string $url): ?string {
    $parts = parse_url($url);
    if (!$parts || !isset($parts['scheme'], $parts['host'])) return null;
    $scheme = strtolower($parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) return null;
    $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);
    return $scheme . '://' . strtolower($parts['host']) . ':' . $port;
}

$source = $origin !== '' ? $origin : ($_SERVER['HTTP_REFERER'] ?? '');
$sourceOrigin = mozole_origin($source);
$allowedOrigins = array_map('mozole_origin', $config['allowed_origins']);
if ($sourceOrigin === null || !in_array($sourceOrigin, $allowedOrigins, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden: Untrusted request origin']);
    exit;
}

// 3. IP Rate Limiting
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateDir = $config['rate_limit']['storage_dir'];
if (!is_dir($rateDir)) {
    @mkdir($rateDir, 0750, true);
}
$ipHash = md5($clientIp);
$rateFile = $rateDir . '/rl_' . $ipHash . '.json';

$now = time();
$window = $config['rate_limit']['window_seconds'];
$maxRequests = $config['rate_limit']['max_requests'];

// Keep the read, quota check and write under the same exclusive lock.
$rateHandle = @fopen($rateFile, 'c+');
if ($rateHandle === false || !flock($rateHandle, LOCK_EX)) {
    if (is_resource($rateHandle)) fclose($rateHandle);
    http_response_code(503);
    echo json_encode(['error' => 'Rate limiter unavailable. Please try again later.']);
    exit;
}

try {
    $raw = stream_get_contents($rateHandle);
    $stored = json_decode($raw === false ? '' : $raw, true);
    $timestamps = is_array($stored)
        ? array_values(array_filter($stored, fn($t) => is_int($t) && $t > $now - $window))
        : [];

    if (count($timestamps) >= $maxRequests) {
        http_response_code(429);
        echo json_encode(['error' => 'Too many requests. Please wait a few minutes before trying again.']);
    } else {
        $timestamps[] = $now;
        $encoded = json_encode($timestamps);
        rewind($rateHandle);
        if (!ftruncate($rateHandle, 0) || fwrite($rateHandle, $encoded) !== strlen($encoded) || !fflush($rateHandle)) {
            http_response_code(503);
            echo json_encode(['error' => 'Rate limiter unavailable. Please try again later.']);
        }
    }
} finally {
    flock($rateHandle, LOCK_UN);
    fclose($rateHandle);
}
if (http_response_code() >= 400) exit;

// 4. Payload Parsing
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!is_array($data)) {
    // Fallback to application/x-www-form-urlencoded
    $data = $_POST;
}

// 5. Honeypot Verification (strict check against empty string or numeric zero)
$honeyField = $config['honeypot_field'];
if (isset($data[$honeyField]) && trim((string)$data[$honeyField]) !== '') {
    // Silently succeed for bots without sending email
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Message delivered.']);
    exit;
}

// 6. Input Sanitization & Validation
foreach (['name', 'email', 'subject', 'message'] as $field) {
    if (isset($data[$field]) && !is_string($data[$field])) {
        http_response_code(400);
        echo json_encode(['error' => 'Contact fields must be strings.']);
        exit;
    }
}

// PCRE Unicode counting works without the optional mbstring extension.
function mozole_length(string $value): int {
    $count = preg_match_all('/./us', $value);
    return $count === false ? PHP_INT_MAX : $count;
}
$name = trim($data['name'] ?? '');
$email = trim($data['email'] ?? '');
$subject = trim($data['subject'] ?? 'Website Inquiry');
$message = trim($data['message'] ?? '');

if (empty($name) || mozole_length($name) > 120) {
    http_response_code(400);
    echo json_encode(['error' => 'A valid name is required (max 120 characters).']);
    exit;
}

if (mozole_length($subject) > 200) {
    http_response_code(400);
    echo json_encode(['error' => 'Subject line is too long (max 200 characters).']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'A valid email address is required.']);
    exit;
}

if (empty($message) || mozole_length($message) > 5000) {
    http_response_code(400);
    echo json_encode(['error' => 'Message body is required (max 5000 characters).']);
    exit;
}

// 7. Dispatch Mail
$sent = mozole_send_mail($config, $email, $name, $subject, $message);

if ($sent) {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Your message has been sent successfully.']);
} else {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'error' => 'Message could not be sent. Please try again later.'
    ]);
}
`;
}

export function generatePhpSecurityHtaccess(): string {
  return `# Mozole Studio - Shared Hosting Security
# Blocks direct access to sensitive PHP files and enforces strict methods

<FilesMatch "^config\\.php$">
    Require all denied
</FilesMatch>

Options -Indexes -MultiViews

<LimitExcept GET POST OPTIONS>
    Require all denied
</LimitExcept>
`;
}

export function generateNodeBackend(): string {
  return `import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 3001);

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "operational", runtime: "node" }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/contact") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data._honey) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: "Message received." }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(\`Backend API running on http://localhost:\${PORT}\`);
});
`;
}

export async function scaffoldBackend(
  projectRoot: string,
  type: "php" | "node" = "php",
): Promise<void> {
  if (type === "php") {
    const apiDir = path.join(projectRoot, "api");
    await atomicWrite(path.join(apiDir, "config.php"), generatePhpConfig());
    await atomicWrite(path.join(apiDir, "mailer.php"), generatePhpMailer());
    await atomicWrite(path.join(apiDir, "index.php"), generatePhpIndex());
    await atomicWrite(path.join(apiDir, ".htaccess"), generatePhpSecurityHtaccess());
  } else {
    const serverDir = path.join(projectRoot, "server");
    await atomicWrite(path.join(serverDir, "index.mjs"), generateNodeBackend());
  }
}

<?php
// index.php - Smart Auto-starting Reverse Proxy for cPanel Shared Hosting
// This script automatically boots up the Node.js server and routes all requests to it.

$port = 3000;
$host = '127.0.0.1';

// Check if Node.js server is already running
$connection = @fsockopen($host, $port, $errno, $errstr, 1);

if (!is_resource($connection)) {
    // Start Node.js server in background (redirecting logs to node.log)
    shell_exec("PORT={$port} node app.js > node.log 2>&1 &");
    // Wait 1.5 seconds for boot
    usleep(1500000);
} else {
    fclose($connection);
}

// Proxy request
$request_uri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

$ch = curl_init("http://{$host}:{$port}{$request_uri}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

// Forward Headers
$headers = [];
foreach (getallheaders() as $name => $value) {
    if (strtolower($name) !== 'host') {
        $headers[] = "$name: $value";
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Forward POST data
if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    echo "<h1>502 Bad Gateway</h1><p>WatchPay Node.js backend failed to start. Please check node.log for details.</p>";
    exit;
}

$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$response_headers = substr($response, 0, $header_size);
$response_body = substr($response, $header_size);

curl_close($ch);

// Output Headers
$header_lines = explode("\r\n", $response_headers);
foreach ($header_lines as $line) {
    if (!empty($line) && strpos(strtolower($line), 'transfer-encoding:') === false) {
        header($line);
    }
}

// Output Body
echo $response_body;

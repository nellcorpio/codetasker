<?php
header('Content-Type: application/json');

// Security Check: Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => ['message' => 'Method Not Allowed']]);
    exit;
}

// Get input data
$input = json_decode(file_get_contents('php://input'), true);
$prompt = $input['prompt'] ?? '';

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'Prompt is required']]);
    exit;
}

// Configuration
$API_KEY = 'sk-pDZWXcs41s04refwJaJWWsQz9tkXE';
$MODEL = 'openai/gpt-5.2';
$API_URL = "https://api.apifree.ai/v1/chat/completions";

// Prepare payload for OpenAI-compatible API
$payload = [
    'model' => $MODEL,
    'messages' => [
        ['role' => 'user', 'content' => $prompt]
    ]
];

// Initialize cURL
$ch = curl_init($API_URL);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $API_KEY
]);

// Execute request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'Proxy Error: ' . curl_error($ch)]]);
} else {
    http_response_code($httpCode);
    echo $response;
}

curl_close($ch);
?>

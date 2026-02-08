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
$API_KEY = 'AIzaSyBBYTbeRWBHGvaqe1lu7bh5OImlpFP9B84';
$MODEL = 'gemini-1.5-flash';
$API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=$API_KEY";

// Prepare payload for Gemini
$payload = [
    'contents' => [
        ['parts' => [['text' => $prompt]]]
    ]
];

// Initialize cURL
$ch = curl_init($API_URL);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

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

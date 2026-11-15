$ErrorActionPreference = "Stop"

function ConvertTo-CppStringLiteral {
  param([string]$Value)

  $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
  $escaped = $escaped.Replace("`r", '\r').Replace("`n", '\n')
  return $escaped
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$secretsPath = Join-Path $projectRoot "src\secrets.h"
$existingSecrets = if (Test-Path $secretsPath) {
  [System.IO.File]::ReadAllText($secretsPath)
} else {
  ""
}

$apiKeyPattern = 'constexpr\s+char\s+DEVICE_API_KEY\[\]\s*=\s*"((?:\\.|[^"\\])*)"\s*;'
if ([regex]::IsMatch($existingSecrets, $apiKeyPattern)) {
  Write-Host "DEVICE_API_KEY sudah tersedia di src\secrets.h."
  return
}

$secureValue = Read-Host -Prompt "Masukkan DEVICE_API_KEY dari backend/.env (input tidak ditampilkan)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if ($apiKey.Length -lt 24) {
  throw "DEVICE_API_KEY harus memiliki minimal 24 karakter."
}

$apiKeyLiteral = ConvertTo-CppStringLiteral $apiKey
$secretsContent = @"
#pragma once

constexpr char DEVICE_API_KEY[] = "$apiKeyLiteral";
"@
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($secretsPath, $secretsContent, $utf8NoBom)
Write-Host "DEVICE_API_KEY disimpan lokal di src\secrets.h."

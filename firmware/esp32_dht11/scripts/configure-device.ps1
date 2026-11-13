param([switch]$RefreshPassword)

$ErrorActionPreference = "Stop"

function Get-CppStringLiteral {
  param([string]$Content, [string]$Name)

  $pattern = 'constexpr\s+char\s+' + [regex]::Escape($Name) +
    '\[\]\s*=\s*"((?:\\.|[^"\\])*)"\s*;'
  $match = [regex]::Match($Content, $pattern)
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  return $null
}

function ConvertTo-CppStringLiteral {
  param([string]$Value)

  $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
  $escaped = $escaped.Replace("`r", '\r').Replace("`n", '\n')
  return $escaped
}

function Read-HiddenValue {
  param([string]$Prompt)

  $secureValue = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$wifiCandidates = @()
foreach ($profile in Get-NetConnectionProfile) {
  $adapter = Get-NetAdapter -InterfaceIndex $profile.InterfaceIndex -ErrorAction SilentlyContinue
  if ($null -eq $adapter -or $adapter.Status -ne "Up") {
    continue
  }

  $isWifi = $adapter.NdisPhysicalMedium -eq 9 -or
    $adapter.InterfaceDescription -match "(?i)wi-?fi|wireless|802\.11"
  if (-not $isWifi) {
    continue
  }

  $configuration = Get-NetIPConfiguration -InterfaceIndex $profile.InterfaceIndex
  $ipv4 = $configuration.IPv4Address |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1
  if ($null -eq $ipv4) {
    continue
  }

  $wifiCandidates += [pscustomobject]@{
    Ssid = $profile.Name
    Ipv4 = $ipv4.IPAddress
    HasGateway = @($configuration.IPv4DefaultGateway).Count -gt 0
  }
}

if ($wifiCandidates.Count -eq 0) {
  throw "Tidak menemukan jaringan Wi-Fi aktif dengan alamat IPv4. Sambungkan komputer ke Wi-Fi lalu jalankan setup kembali."
}

$wifi = $wifiCandidates |
  Sort-Object @{ Expression = { if ($_.HasGateway) { 0 } else { 1 } } } |
  Select-Object -First 1
$ssidLiteral = ConvertTo-CppStringLiteral $wifi.Ssid

$projectRoot = Split-Path -Parent $PSScriptRoot
$secretsPath = Join-Path $projectRoot "src\secrets.h"
$networkConfigPath = Join-Path $projectRoot "src\network_config.h"
$existingSecrets = if (Test-Path $secretsPath) {
  [System.IO.File]::ReadAllText($secretsPath)
} else {
  ""
}

$savedSsid = Get-CppStringLiteral $existingSecrets "WIFI_SSID"
$savedPassword = Get-CppStringLiteral $existingSecrets "WIFI_PASSWORD"
if (-not $RefreshPassword -and $savedSsid -eq $ssidLiteral -and $null -ne $savedPassword) {
  $passwordLiteral = $savedPassword
  Write-Host "SSID tidak berubah; memakai password lokal yang sudah tersimpan."
} else {
  $password = Read-HiddenValue ("Masukkan password untuk Wi-Fi " + $wifi.Ssid + " (input tidak ditampilkan)")
  if ($password.Length -ne 0 -and ($password.Length -lt 8 -or $password.Length -gt 64)) {
    throw "Password Wi-Fi harus kosong untuk jaringan terbuka atau berisi 8-64 karakter."
  }
  $passwordLiteral = ConvertTo-CppStringLiteral $password
}

$apiKeyLiteral = Get-CppStringLiteral $existingSecrets "DEVICE_API_KEY"
if ($null -eq $apiKeyLiteral) {
  $apiKey = Read-HiddenValue "Masukkan DEVICE_API_KEY dari backend/.env (input tidak ditampilkan)"
  if ($apiKey.Length -lt 24) {
    throw "DEVICE_API_KEY harus memiliki minimal 24 karakter."
  }
  $apiKeyLiteral = ConvertTo-CppStringLiteral $apiKey
}

$secretsContent = @"
#pragma once

constexpr char WIFI_SSID[] = "$ssidLiteral";
constexpr char WIFI_PASSWORD[] = "$passwordLiteral";
constexpr char DEVICE_API_KEY[] = "$apiKeyLiteral";
"@
$networkConfigContent = @"
#pragma once

constexpr char API_URL[] = "http://$($wifi.Ipv4):3000/api/monitoring/readings";
constexpr char SETTINGS_URL[] = "http://$($wifi.Ipv4):3000/api/settings";
constexpr char BUZZER_URL[] = "http://$($wifi.Ipv4):3000/api/device/buzzer";
"@
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($secretsPath, $secretsContent, $utf8NoBom)
[System.IO.File]::WriteAllText($networkConfigPath, $networkConfigContent, $utf8NoBom)

Write-Host "SSID terdeteksi: $($wifi.Ssid)"
Write-Host "IP backend diperbarui: $($wifi.Ipv4):3000"
Write-Host "Konfigurasi lokal siap. Password dan API key tidak ditampilkan."

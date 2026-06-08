﻿# FormFillingTool -LLM Connection Diagnostics
# Sammelt alle relevanten Debug-Informationen und schreibt sie in eine Textdatei.
# Ausfuehren: powershell -ExecutionPolicy Bypass -File .\Test-LlmConnection.ps1

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

# ── Ausgabe-Datei ────────────────────────────────────────────────────────────
$timestamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$reportFile = Join-Path $PSScriptRoot "fft-diagnostics-$timestamp.txt"
$lines      = [System.Collections.Generic.List[string]]::new()

function w([string]$text = "") {
    Write-Host $text
    $lines.Add($text)
}

function wh([string]$title) {
    w ""
    w ("=" * 60)
    w "  $title"
    w ("=" * 60)
}

function save {
    $lines | Set-Content -Path $reportFile -Encoding UTF8
}

# ── Parameter abfragen ───────────────────────────────────────────────────────
w ""
w "FormFillingTool -LLM Connection Diagnostics"
w "Alle Antworten werden in eine Datei geschrieben."
w ""

$llmUrl = Read-Host "LLM Server URL (z.B. https://llm.example.com)"
$llmUrl = $llmUrl.Trim().TrimEnd("/")

# https:// automatisch ergaenzen wenn kein Schema angegeben
if ($llmUrl -notmatch "^https?://") {
    $llmUrl = "https://" + $llmUrl
    Write-Host "  Hinweis: Schema ergaenzt -> $llmUrl" -ForegroundColor Yellow
}

# URL-Validierung vor dem Start
try {
    $testUri = [System.Uri]$llmUrl
    if (-not $testUri.IsAbsoluteUri) { throw "Kein absoluter URI" }
} catch {
    Write-Host ""
    Write-Host "FEHLER: '$llmUrl' ist keine gueltige URL." -ForegroundColor Red
    Write-Host "Bitte mit Schema eingeben, z.B.: https://ai.example.com" -ForegroundColor Red
    Write-Host ""
    pause
    exit 1
}

w "Backend-Typ:"
w "  [O] Ollama (kein API-Key)"
w "  [A] OpenAI-kompatibel (Bearer-Token)"
w "  [G] Generic (eigener Header)"
$backendChoice = Read-Host "Auswahl [O/A/G]"

$apiKey       = ""
$apiKeyHeader = ""
$model        = Read-Host "Model-Name (z.B. llama3)"

if ($backendChoice -match "^[Aa]$") {
    $apiKey       = Read-Host "API-Key (Enter = leer lassen)"
    $apiKeyHeader = "Authorization"
} elseif ($backendChoice -match "^[Gg]$") {
    $apiKeyHeader = Read-Host "Header-Name fuer API-Key (z.B. X-API-Key)"
    $apiKey       = Read-Host "API-Key-Wert"
}

$uri  = [System.Uri]$llmUrl
$host_ = $uri.Host
$port  = if ($uri.Port -gt 0) { $uri.Port } else { if ($uri.Scheme -eq "https") { 443 } else { 80 } }

w ""
w "Starte Diagnose -bitte warten..."
w ""

# ════════════════════════════════════════════════════════════════════════════
wh "1/8  Systemumgebung"
# ════════════════════════════════════════════════════════════════════════════
try {
    w "Datum/Zeit    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    w "Computer      : $env:COMPUTERNAME"
    w "Benutzer      : $env:USERDOMAIN\$env:USERNAME"
    w "Windows       : $(([System.Environment]::OSVersion).VersionString)"
    $psVer = $PSVersionTable.PSVersion
    w "PowerShell    : $psVer"
    w ".NET           : $([System.Environment]::Version)"
    w "LLM URL       : $llmUrl"
    w "Backend       : $backendChoice"
    w "Model         : $model"
    w "API-Key       : $(if ($apiKey) { '*** (gesetzt, ' + $apiKey.Length + ' Zeichen)' } else { '(keiner)' })"
    w "[1/8] OK"
} catch { w "[1/8] FEHLER: $_" }
save

# ════════════════════════════════════════════════════════════════════════════
wh "2/8  Proxy-Einstellungen"
# ════════════════════════════════════════════════════════════════════════════
try {
    w "--- WinHTTP-Proxy (netsh) ---"
    $netsh = netsh winhttp show proxy 2>&1
    $netsh | ForEach-Object { w "  $_" }

    w ""
    w "--- WinINET/IE-Proxy (Registry) ---"
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
    $ie = Get-ItemProperty $regPath -ErrorAction SilentlyContinue
    w "  ProxyEnable  : $($ie.ProxyEnable)"
    w "  ProxyServer  : $($ie.ProxyServer)"
    w "  ProxyOverride: $($ie.ProxyOverride)"
    w "  AutoConfigURL: $($ie.AutoConfigURL)"

    w ""
    w "--- Umgebungsvariablen ---"
    w "  HTTP_PROXY   : $($env:HTTP_PROXY)"
    w "  HTTPS_PROXY  : $($env:HTTPS_PROXY)"
    w "  NO_PROXY     : $($env:NO_PROXY)"
    w "  http_proxy   : $($env:http_proxy)"
    w "  https_proxy  : $($env:https_proxy)"

    w "[2/8] OK"
} catch { w "[2/8] FEHLER: $_" }
save

# ════════════════════════════════════════════════════════════════════════════
wh "3/8  DNS-Aufloesung"
# ════════════════════════════════════════════════════════════════════════════
try {
    w "Hostname: $host_"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $addresses = [System.Net.Dns]::GetHostAddresses($host_)
    $sw.Stop()
    w "Aufgeloest in: $($sw.ElapsedMilliseconds) ms"
    $addresses | ForEach-Object { w "  IP: $($_.IPAddressToString)  (Typ: $($_.AddressFamily))" }
    w "[3/8] OK"
} catch {
    w "[3/8] FEHLER: DNS-Aufloesung fehlgeschlagen"
    w "  $_"
}
save

# ════════════════════════════════════════════════════════════════════════════
wh "4/8  TCP-Verbindung"
# ════════════════════════════════════════════════════════════════════════════
try {
    w "Verbinde zu ${host_}:${port}..."
    $sw  = [System.Diagnostics.Stopwatch]::StartNew()
    $tcp = [System.Net.Sockets.TcpClient]::new()
    $task = $tcp.ConnectAsync($host_, $port)
    if (-not $task.Wait(5000)) {
        w "[4/8] TIMEOUT: Keine Verbindung nach 5 Sekunden"
    } else {
        $sw.Stop()
        w "TCP-Verbindung: ERFOLGREICH in $($sw.ElapsedMilliseconds) ms"
        $tcp.Close()
        w "[4/8] OK"
    }
} catch {
    w "[4/8] FEHLER: TCP-Verbindung abgelehnt oder Timeout"
    w "  $_"
}
save

# ════════════════════════════════════════════════════════════════════════════
wh "5/8  TLS / Zertifikat"
# ════════════════════════════════════════════════════════════════════════════
if ($uri.Scheme -eq "https") {
    try {
        $tcpTls  = [System.Net.Sockets.TcpClient]::new($host_, $port)
        $ssl     = [System.Net.Security.SslStream]::new($tcpTls.GetStream(), $false, {
            param($s, $cert, $chain, $errors)
            $script:tlsCert   = $cert
            $script:tlsErrors = $errors
            $true   # Verbindung trotz Fehler aufbauen (nur fuer Diagnose)
        })
        $ssl.AuthenticateAsClient($host_)

        $cert = $script:tlsCert
        w "TLS-Version     : $($ssl.SslProtocol)"
        w "Cipher          : $($ssl.CipherAlgorithm) / $($ssl.HashAlgorithm)"
        w ""
        w "--- Zertifikat ---"
        w "  Subject        : $($cert.Subject)"
        w "  Issuer         : $($cert.Issuer)"
        w "  Gueltig von    : $($cert.GetEffectiveDateString())"
        w "  Gueltig bis    : $($cert.GetExpirationDateString())"
        w "  Fingerprint    : $($cert.GetCertHashString())"
        w "  Zertifikats-Fehler: $($script:tlsErrors)"

        if ($script:tlsErrors -ne [System.Net.Security.SslPolicyErrors]::None) {
            w "  *** ZERTIFIKATSFEHLER -moeglicherweise selbst-signiert oder abgelaufen ***"
        } else {
            w "  Zertifikatskette: gueltig"
        }

        $ssl.Close()
        $tcpTls.Close()
        w "[5/8] OK"
    } catch {
        w "[5/8] FEHLER bei TLS-Handshake:"
        w "  $_"
    }
} else {
    w "Kein HTTPS -TLS-Test wird uebersprungen."
    w "[5/8] SKIP (HTTP)"
}
save

# ════════════════════════════════════════════════════════════════════════════
wh "6/8  HTTP Response-Header"
# ════════════════════════════════════════════════════════════════════════════
function Invoke-Request([string]$method, [string]$url, [hashtable]$headers = @{}, [string]$body = "") {
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Method  = $method
        $req.Timeout = 10000
        $req.AllowAutoRedirect = $true

        # Systemproxy + Windows-Credentials weiterleiten (NTLM/Kerberos)
        $req.Proxy = [System.Net.WebRequest]::GetSystemWebProxy()
        $req.Proxy.Credentials = [System.Net.CredentialCache]::DefaultCredentials
        $req.UseDefaultCredentials = $true

        foreach ($kv in $headers.GetEnumerator()) {
            if ($kv.Key -eq "Content-Type") { $req.ContentType = $kv.Value }
            else { try { $req.Headers[$kv.Key] = $kv.Value } catch {} }
        }

        if ($body) {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $req.ContentLength = $bytes.Length
            $req.GetRequestStream().Write($bytes, 0, $bytes.Length)
        }

        $sw  = [System.Diagnostics.Stopwatch]::StartNew()
        $res = $req.GetResponse()
        $sw.Stop()
        $bodyText = [System.IO.StreamReader]::new($res.GetResponseStream()).ReadToEnd()
        return @{
            Status  = [int]$res.StatusCode
            Headers = $res.Headers
            Body    = $bodyText
            Ms      = $sw.ElapsedMilliseconds
            Error   = $null
        }
    } catch [System.Net.WebException] {
        $errRes = $_.Exception.Response
        $errBody = ""
        if ($errRes) {
            try { $errBody = [System.IO.StreamReader]::new($errRes.GetResponseStream()).ReadToEnd() } catch {}
            return @{
                Status  = [int]$errRes.StatusCode
                Headers = $errRes.Headers
                Body    = $errBody
                Ms      = 0
                Error   = $_.Exception.Message
            }
        }
        return @{ Status = 0; Headers = $null; Body = ""; Ms = 0; Error = $_.Exception.Message }
    } catch {
        return @{ Status = 0; Headers = $null; Body = ""; Ms = 0; Error = $_.ToString() }
    }
}

function Show-Result([hashtable]$r, [string]$label) {
    w ""
    w "--- $label ---"
    if ($r.Error -and $r.Status -eq 0) {
        w "  FEHLER: $($r.Error)"
    } else {
        w "  Status   : $($r.Status)"
        w "  Dauer    : $($r.Ms) ms"
        if ($r.Headers) {
            $r.Headers.AllKeys | ForEach-Object {
                w "  Header   : $_ = $($r.Headers[$_])"
            }
        }
        $preview = if ($r.Body.Length -gt 400) { $r.Body.Substring(0, 400) + "..." } else { $r.Body }
        w "  Body     : $preview"
    }
}

# Aufbau der Request-Header je nach Backend
$authHeaders = @{}
if ($backendChoice -match "^[Aa]$" -and $apiKey) {
    $authHeaders["Authorization"] = "Bearer $apiKey"
} elseif ($backendChoice -match "^[Gg]$" -and $apiKeyHeader -and $apiKey) {
    $authHeaders[$apiKeyHeader] = $apiKey
}

# GET Root-URL
$r = Invoke-Request "GET" $llmUrl
Show-Result $r "GET $llmUrl"
w ""

# CORS-relevante Header pruefen
if ($r.Headers) {
    $acao = $r.Headers["Access-Control-Allow-Origin"]
    if ($acao) { w "  CORS Access-Control-Allow-Origin: $acao  [vorhanden]" }
    else        { w "  CORS Access-Control-Allow-Origin: FEHLT -Browser wird Anfragen blockieren" }
}
w "[6/8] OK"
save

# ════════════════════════════════════════════════════════════════════════════
wh "7/8  LLM API Tests"
# ════════════════════════════════════════════════════════════════════════════

# OPTIONS Preflight (CORS)
$optR = Invoke-Request "OPTIONS" "$llmUrl/api/chat" @{
    "Origin"                         = "http://localhost:8080"
    "Access-Control-Request-Method"  = "POST"
    "Access-Control-Request-Headers" = "Content-Type, Authorization"
}
Show-Result $optR "OPTIONS /api/chat (CORS Preflight)"
if ($optR.Headers) {
    $acao = $optR.Headers["Access-Control-Allow-Origin"]
    if ($acao) { w "  => CORS erlaubt: $acao" }
    else        { w "  => CORS-Header fehlt in OPTIONS-Antwort" }
}

# Ollama: GET /api/tags
$tagsR = Invoke-Request "GET" "$llmUrl/api/tags"
Show-Result $tagsR "GET /api/tags (Ollama Modellliste)"

# OpenAI: GET /models
$modelsR = Invoke-Request "GET" "$llmUrl/models" $authHeaders
Show-Result $modelsR "GET /models (OpenAI-compat)"

# Open WebUI: GET /api/models (zeigt verfuegbare Model-IDs)
$owModelsR = Invoke-Request "GET" "$llmUrl/api/models" $authHeaders
Show-Result $owModelsR "GET /api/models (Open WebUI Modellliste mit API-Key)"

# Minimal-Chat-Request MIT API-Key
$chatBody = '{"model":"' + $model + '","messages":[{"role":"user","content":"ping"}],"max_tokens":1,"stream":false}'
$chatHeaders = $authHeaders + @{ "Content-Type" = "application/json" }

$chatR = Invoke-Request "POST" "$llmUrl/api/chat" $chatHeaders $chatBody
Show-Result $chatR "POST /api/chat mit API-Key"

$chatR2 = Invoke-Request "POST" "$llmUrl/chat/completions" $chatHeaders $chatBody
Show-Result $chatR2 "POST /chat/completions mit API-Key"

# Open WebUI: POST /api/chat/completions (der korrekte Endpoint)
$chatR3 = Invoke-Request "POST" "$llmUrl/api/chat/completions" $chatHeaders $chatBody
Show-Result $chatR3 "POST /api/chat/completions mit API-Key (Open WebUI)"

# Selber Test OHNE API-Key (zum Vergleich)
if ($apiKey) {
    $chatBodyNoKey = $chatBody
    $chatRNoKey = Invoke-Request "POST" "$llmUrl/api/chat" @{ "Content-Type" = "application/json" } $chatBodyNoKey
    Show-Result $chatRNoKey "POST /api/chat OHNE API-Key (Vergleich)"
}

w ""
w "[7/8] OK"
save

# ════════════════════════════════════════════════════════════════════════════
wh "8/8  Zusammenfassung"
# ════════════════════════════════════════════════════════════════════════════

$summary = @()

# DNS
try {
    [System.Net.Dns]::GetHostAddresses($host_) | Out-Null
    $summary += "OK  DNS-Aufloesung fuer $host_"
} catch {
    $summary += "ERR DNS-Aufloesung fehlgeschlagen: $_"
}

# TCP
try {
    $t = [System.Net.Sockets.TcpClient]::new()
    if ($t.ConnectAsync($host_, $port).Wait(3000)) {
        $summary += "OK  TCP-Verbindung ${host_}:${port}"
        $t.Close()
    } else {
        $summary += "ERR TCP-Verbindung ${host_}:${port} -Timeout"
    }
} catch {
    $summary += "ERR TCP-Verbindung ${host_}:${port} -$_"
}

# TLS
if ($uri.Scheme -eq "https" -and $script:tlsErrors -ne $null) {
    if ($script:tlsErrors -eq [System.Net.Security.SslPolicyErrors]::None) {
        $summary += "OK  TLS-Zertifikat gueltig"
    } else {
        $summary += "WRN TLS-Zertifikatsfehler: $($script:tlsErrors)"
    }
}

# HTTP
if ($r.Status -in 200..299)         { $summary += "OK  HTTP erreichbar (Status $($r.Status))" }
elseif ($r.Status -in 400..499)     { $summary += "WRN HTTP $($r.Status) -Authentifizierung oder Endpoint pruefen" }
elseif ($r.Status -eq 0)            { $summary += "ERR HTTP nicht erreichbar: $($r.Error)" }
else                                 { $summary += "WRN HTTP Status $($r.Status)" }

# CORS
$corsMissing = (-not $optR.Headers -or -not $optR.Headers["Access-Control-Allow-Origin"])
if ($corsMissing) { $summary += "ERR CORS-Header fehlt -Browser blockiert Anfragen vom Proxy" }
else              { $summary += "OK  CORS-Header vorhanden: $($optR.Headers['Access-Control-Allow-Origin'])" }

# Auth — alle drei Chat-Endpoints betrachten
$chatStatuses = @($chatR.Status, $chatR2.Status, $chatR3.Status)
if ($chatStatuses -contains 401) {
    $summary += "ERR HTTP 401 Unauthorized -API-Key pruefen oder fehlt"
} elseif ($chatStatuses -contains 403) {
    $summary += "ERR HTTP 403 Forbidden -fehlende Berechtigung"
} elseif (($chatStatuses | Where-Object { $_ -in 200..299 }).Count -gt 0) {
    $summary += "OK  LLM-Chat-Anfrage erfolgreich"
} else {
    $summary += "WRN Chat-Anfrage: /api/chat=$($chatR.Status) /chat/completions=$($chatR2.Status) /api/chat/completions=$($chatR3.Status)"
}

# Open WebUI Modellliste
if ($owModelsR.Status -in 200..299) {
    $summary += "OK  /api/models erreichbar (Model-IDs siehe Abschnitt 7)"
}

w ""
$summary | ForEach-Object { w $_ }
w ""
w "[8/8] Diagnose abgeschlossen."

save

w ""
Write-Host "Bericht gespeichert: $reportFile" -ForegroundColor Green
Write-Host "Bitte diese Datei zur Analyse weiterleiten." -ForegroundColor Green
w ""

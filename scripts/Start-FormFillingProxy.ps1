# ── Konfiguration ───────────────────────────────────────────────────────────
# Ziel-URL des LLM-Servers (kein abschliessender Slash)
$LLM_TARGET  = "https://dein-llm-server.example.com"
$LISTEN_PORT = 8080
# HTML-Datei liegt im gleichen Ordner wie dieses Script
$HTML_FILE   = Join-Path $PSScriptRoot "FormFillingTool.html"
# ────────────────────────────────────────────────────────────────────────────

# Selbstsignierte TLS-Zertifikate des LLM-Servers akzeptieren (Kommentar entfernen bei Bedarf):
# [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

if (-not (Test-Path $HTML_FILE)) {
    Write-Error "FormFillingTool.html nicht gefunden: $HTML_FILE"
    Write-Host  "Bitte 'npm run build' ausfuehren und dist/FormFillingTool.html hier ablegen."
    exit 1
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$LISTEN_PORT/")

try { $listener.Start() }
catch {
    Write-Error "Port $LISTEN_PORT ist bereits belegt. '$LISTEN_PORT' im Script aendern."
    exit 1
}

Write-Host ""
Write-Host "FormFillingTool-Proxy laeuft."
Write-Host "   Browser:  http://localhost:$LISTEN_PORT/"
Write-Host "   LLM-Ziel: $LLM_TARGET"
Write-Host ""
Write-Host "LLM-Endpunkt in den Settings eintragen: http://localhost:$LISTEN_PORT"
Write-Host "Fenster offen lassen. Beenden: Ctrl+C oder Fenster schliessen."
Write-Host ""

Start-Process "http://localhost:$LISTEN_PORT/"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    # CORS-Header fuer alle Antworten
    $res.Headers.Add("Access-Control-Allow-Origin",  "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

    # OPTIONS-Preflight
    if ($req.HttpMethod -eq "OPTIONS") {
        $res.StatusCode = 204
        $res.Close()
        continue
    }

    # HTML-Datei ausliefern
    if ($req.Url.AbsolutePath -eq "/" -or $req.Url.AbsolutePath -eq "/index.html") {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($HTML_FILE)
            $res.ContentType     = "text/html; charset=utf-8"
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $res.StatusCode = 500
        }
        $res.Close()
        continue
    }

    # Alle anderen Anfragen an den LLM-Server weiterleiten
    try {
        $targetUrl     = $LLM_TARGET.TrimEnd("/") + $req.Url.PathAndQuery
        $webReq        = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create($targetUrl)
        $webReq.Method = $req.HttpMethod

        # gzip/deflate-Antworten automatisch entpacken (.NET setzt Accept-Encoding selbst)
        $webReq.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate

        # Accept-Encoding NICHT weiterleiten — sonst wuerde die Antwort komprimiert ankommen
        # und beim Lesen als Text zerstoert (Ursache fuer "JSON.parse: unexpected character")
        $skipHeaders = @("Host", "Content-Length", "Transfer-Encoding", "Accept-Encoding")
        foreach ($h in $req.Headers.AllKeys) {
            if ($h -notin $skipHeaders) {
                try { $webReq.Headers[$h] = $req.Headers[$h] } catch {}
            }
        }

        if ($req.HasEntityBody) {
            $webReq.ContentType = $req.ContentType
            $body      = [System.IO.StreamReader]::new($req.InputStream).ReadToEnd()
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $webReq.ContentLength = $bodyBytes.Length
            $reqStream = $webReq.GetRequestStream()
            $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
            $reqStream.Close()
        }

        $webRes    = $webReq.GetResponse()
        $respBody  = [System.IO.StreamReader]::new($webRes.GetResponseStream()).ReadToEnd()
        $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respBody)

        $res.StatusCode      = [int]$webRes.StatusCode
        $res.ContentType     = $webRes.ContentType
        $res.ContentLength64 = $respBytes.Length
        $res.OutputStream.Write($respBytes, 0, $respBytes.Length)
        $webRes.Close()

    } catch [System.Net.WebException] {
        $errRes = $_.Exception.Response
        if ($errRes) {
            $res.StatusCode = [int]$errRes.StatusCode
            $errBody  = [System.IO.StreamReader]::new($errRes.GetResponseStream()).ReadToEnd()
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errBody)
            $res.ContentLength64 = $errBytes.Length
            $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $errRes.Close()
        } else {
            $res.StatusCode = 502
            Write-Warning "Proxy-Fehler: $($_.Exception.Message)"
        }
    } catch {
        $res.StatusCode = 500
        Write-Warning "Unbekannter Fehler: $($_.Exception.Message)"
    } finally {
        $res.Close()
    }
}

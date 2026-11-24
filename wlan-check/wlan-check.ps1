# WLAN-Check für Windows (nur lesen, ändert nichts)
# Start: Rechtsklick auf Windows-Startmenü -> "Terminal" / "PowerShell", dann:
#   powershell -ExecutionPolicy Bypass -File .\wlan-check.ps1
# Ergebnis landet in wlan-ergebnis.txt neben dem Skript.

$out = Join-Path $PSScriptRoot "wlan-ergebnis.txt"
Start-Transcript -Path $out -Force | Out-Null

function Section($t) { Write-Host "`n===== $t =====" }

Section "Datum"
Get-Date

Section "Aktuelle WLAN-Verbindung (Signal, Kanal, Band, Geschwindigkeit)"
netsh wlan show interfaces

Section "WLAN-Netze in der Umgebung (Kanal-Belegung der Nachbarn)"
netsh wlan show networks mode=bssid

Section "IP-Konfiguration"
ipconfig /all

$gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object RouteMetric | Select-Object -First 1).NextHop
Write-Host "`nRouter (Gateway): $gw"

if ($gw) {
  Section "Ping zum Router (30 Pakete) - zeigt reines WLAN-Problem"
  ping -n 30 $gw
}

Section "Ping ins Internet 1.1.1.1 (30 Pakete)"
ping -n 30 1.1.1.1

Section "DNS-Geschwindigkeit"
foreach ($dns in @($null, "1.1.1.1", "8.8.8.8")) {
  foreach ($name in @("google.com","wikipedia.org","amazon.de")) {
    $t = Measure-Command {
      if ($dns) { Resolve-DnsName $name -Server $dns -DnsOnly -ErrorAction SilentlyContinue | Out-Null }
      else      { Resolve-DnsName $name -DnsOnly -ErrorAction SilentlyContinue | Out-Null }
    }
    $label = if ($dns) { $dns } else { "Standard-DNS" }
    "{0,-14} {1,-16} {2,6:N0} ms" -f $label, $name, $t.TotalMilliseconds
  }
}

Section "Geschwindigkeits-Test (Download ca. 25 MB von Cloudflare)"
try {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $data = (New-Object Net.WebClient).DownloadData("https://speed.cloudflare.com/__down?bytes=25000000")
  $sw.Stop()
  $mbit = ($data.Length * 8 / 1e6) / $sw.Elapsed.TotalSeconds
  "Download: {0:N1} MBit/s" -f $mbit
} catch { "Speedtest fehlgeschlagen: $_" }

Section "Netzwerkadapter"
Get-NetAdapter | Format-Table Name, Status, LinkSpeed, InterfaceDescription -AutoSize

Stop-Transcript | Out-Null
Write-Host "`nFertig. Schick mir den Inhalt von: $out"

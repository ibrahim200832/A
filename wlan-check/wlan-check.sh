#!/usr/bin/env bash
# WLAN-Check für Mac und Linux (nur lesen, ändert nichts)
# Start im Terminal:  bash wlan-check.sh
# Ergebnis landet in wlan-ergebnis.txt neben dem Skript.

cd "$(dirname "$0")" || exit 1
OUT="wlan-ergebnis.txt"
exec > >(tee "$OUT") 2>&1

section() { printf '\n===== %s =====\n' "$1"; }
OS="$(uname -s)"

section "Datum / System"
date; uname -a

if [ "$OS" = "Darwin" ]; then
  section "WLAN-Verbindung (Signal, Kanal, Band, Rate)"
  system_profiler SPAirPortDataType 2>/dev/null | sed -n '1,60p'
  GW="$(route -n get default 2>/dev/null | awk '/gateway/{print $2}')"
else
  section "WLAN-Verbindung (Signal, Kanal, Band, Rate)"
  if command -v nmcli >/dev/null; then
    nmcli -f IN-USE,SSID,CHAN,FREQ,RATE,SIGNAL,SECURITY dev wifi list 2>/dev/null
  fi
  if command -v iw >/dev/null; then
    for i in $(iw dev 2>/dev/null | awk '/Interface/{print $2}'); do
      echo "--- $i ---"; iw dev "$i" link; iw dev "$i" info
    done
  fi
  GW="$(ip route 2>/dev/null | awk '/default/{print $3; exit}')"
fi

echo; echo "Router (Gateway): ${GW:-nicht gefunden}"

if [ -n "$GW" ]; then
  section "Ping zum Router (30 Pakete) - zeigt reines WLAN-Problem"
  ping -c 30 "$GW"
fi

section "Ping ins Internet 1.1.1.1 (30 Pakete)"
ping -c 30 1.1.1.1

section "DNS-Geschwindigkeit"
if command -v dig >/dev/null; then
  for dns in "" 1.1.1.1 8.8.8.8; do
    for name in google.com wikipedia.org amazon.de; do
      t=$(dig ${dns:+@$dns} "$name" +tries=1 +time=3 2>/dev/null | awk '/Query time/{print $4" ms"}')
      printf '%-14s %-16s %s\n' "${dns:-Standard-DNS}" "$name" "${t:-fehlgeschlagen}"
    done
  done
else
  echo "dig nicht installiert - DNS-Test übersprungen"
fi

section "Geschwindigkeits-Test (Download ca. 25 MB von Cloudflare)"
if command -v curl >/dev/null; then
  curl -s -o /dev/null -w 'Download: %{speed_download} Byte/s  (=%{size_download} Byte in %{time_total}s)\n' \
    "https://speed.cloudflare.com/__down?bytes=25000000"
else
  echo "curl nicht installiert"
fi

section "Netzwerk-Schnittstellen"
if [ "$OS" = "Darwin" ]; then ifconfig | grep -E '^[a-z]|inet |status' ; else ip -br addr; fi

echo; echo "Fertig. Schick mir den Inhalt von: $(pwd)/$OUT"

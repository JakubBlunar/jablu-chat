#!/usr/bin/env bash
#
# yt-preview-diagnostics.sh  (v2)
# ------------------------------
# Confirms whether the VPS's IPv6 egress is why link-preview.service.ts stores a
# degraded YouTube preview (title "- YouTube", generic description, null image).
#
# YouTube serves different responses per IP family: full video page over IPv4,
# degraded/empty over datacenter IPv6. The dev box egresses IPv4 (works);
# the VPS egresses IPv6 (broken). This script proves which is the case HERE.
#
#   Usage:  bash yt-preview-diagnostics.sh [URL]
#   Paste-safe setup: pipe the base64 one-liner from chat, or scp the file.
#   Needs:  curl, grep, sed. Read-only GETs. Safe to run repeatedly.
#
set -uo pipefail

# --- sanitize the URL (strip chat's "@url:`...`" wrapper, quotes, spaces) ---
RAW="${1:-https://youtu.be/8C-J2sRBMkQ?is=f5zJ4HX83q9ClsG-}"
URL="$(printf '%s' "$RAW" | sed -e 's/^@url:[[:space:]]*//' -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

# derive the canonical watch URL (youtu.be shortener -> /watch?v=ID)
VID="$(printf '%s' "$URL" | sed -n 's/.*youtu\.be\/\([A-Za-z0-9_-]\{11\}\).*/\1/p')"
[ -z "$VID" ] && VID="$(printf '%s' "$URL" | sed -n 's/.*[?&]v=\([A-Za-z0-9_-]\{11\}\).*/\1/p')"
[ -z "$VID" ] && VID="$(printf '%s' "$URL" | sed -n 's/.*youtube\.com\/embed\/\([A-Za-z0-9_-]\{11\}\).*/\1/p')"
WATCH="https://www.youtube.com/watch?v=$VID"

echo "================================================================"
echo " Pasted URL : $RAW"
echo " Clean URL  : $URL"
echo " Watch URL  : $WATCH"
echo " Host       : $(hostname 2>/dev/null)"
echo " Public IPv4: $(curl -4 -s --max-time 8 https://ifconfig.me 2>/dev/null || echo '(none)')"
echo " Public IPv6: $(curl -6 -s --max-time 8 https://ifconfig.me 2>/dev/null || echo '(none)')"
echo " Time (UTC) : $(date -u)"
echo "================================================================"

check_family() {
  local fam="$1"   # 4 or 6
  local label="$2"
  local flag="-${fam}"
  local body
  echo ""
  echo "----------------------------------------------------------------"
  echo " [${label}]"
  echo "----------------------------------------------------------------"
  if ! body="$(curl -s $flag --compressed --max-time 25 \
        -A 'Mozilla/5.0 (compatible; ChatBot/1.0; +link-preview)' \
        -H 'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' \
        -H 'Accept-Language: en-US,en;q=0.9' \
        -w '\n@@META@@%{http_code} %{size_download}' \
        "$WATCH" 2>/dev/null)"; then
    echo "   connection FAILED (no IPv${fam} egress, or network error)"
    return
  fi
  local meta code size ogtitle desc
  meta="$(printf '%s' "$body" | sed -n 's/.*@@META@@\([0-9]*\) \([0-9]*\)$/\1 \2/p')"
  code="${meta%% *}"; size="${meta##* }"
  body="$(printf '%s' "$body" | sed 's/@@META@@[0-9]* [0-9]*$//')"
  ogtitle="$(printf '%s' "$body" | grep -oiP '<meta[^>]+property="og:title"\s+content="\K[^"]{0,200}' | head -1)"
  desc="$(printf '%s' "$body" | grep -oiP '<meta[^>]+property="og:description"\s+content="\K[^"]{0,100}' | head -1)"
  echo "   HTTP status : ${code:-?}"
  echo "   body bytes  : ${size:-?}"
  echo "   og:title    : ${ogtitle:-<none>}"
  echo "   og:image    : $(printf '%s' "$body" | grep -oiP '<meta[^>]+property="og:image"\s+content="\K[^"]{0,140}' | head -1 || true)"
  echo "   description : ${desc:-<none>}"
  if [ -n "$ogtitle" ]; then
    echo "   => GOOD: real video page over IPv${fam}"
  else
    echo "   => DEGRADED: no og:title over IPv${fam}  <-- this is what the server stored"
    printf '%s' "$desc" | grep -qi 'enjoy the videos and music you love' \
      && echo "      (generic YouTube HOMEPAGE meta — a shell/landing page)"
  fi
}

echo ""
echo ">>> Testing each IP family SEPARATELY against the video page"
check_family 4 "IPv4 egress only (curl -4)"
check_family 6 "IPv6 egress only (curl -6)"

# oEmbed per family — determines if an oEmbed fallback is viable from this VPS
for fam in 4 6; do
  echo ""
  echo "----------------------------------------------------------------"
  echo " [oEmbed over IPv${fam}]"
  echo "----------------------------------------------------------------"
  out="$(curl -s $fam --compressed --max-time 15 -G 'https://www.youtube.com/oembed' \
        --data-urlencode "url=$WATCH" --data-urlencode 'format=json' \
        -A 'Mozilla/5.0 (compatible; ChatBot/1.0; +link-preview)' 2>/dev/null)"
  if [ -n "$out" ]; then
    printf '%s' "$out" | head -c 400; echo ""
    echo "   => oEmbed works over IPv${fam}"
  else
    echo "   EMPTY/FAILED — oEmbed unusable over IPv${fam}"
  fi
done

echo ""
echo "================================================================"
echo " VERDICT"
echo "================================================================"
echo " • IPv4 good, IPv6 degraded  => ROOT CAUSE CONFIRMED: the server's Node"
echo "   fetch connects to YouTube over IPv6 on this VPS and gets a shell page"
echo "   (its <title> is '- YouTube' — exactly the stored preview row)."
echo "   FIX: force IPv4 for the link-preview fetch (I can prepare that patch)."
echo ""
echo " • Both families good here   => the bad row is stale: link-preview.service.ts"
echo "   caches failures 5 min / successes 30 min in memory. Restart the API and"
echo "   send a FRESH link; if the new row is correct, it was a transient fetch"
echo "   failure that got cached."
echo ""
echo " • Both degraded             => YouTube is blocking this VPS IP range entirely"
echo "   (or a transparent proxy interferes). The oEmbed results above show whether"
echo "   the oEmbed fallback is still usable."
echo "================================================================"

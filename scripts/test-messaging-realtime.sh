#!/bin/bash
# Test temps réel messagerie LocaBénin — tout-en-un (sandbox recycle les processus)
# A = Kossi (propriétaire) · B = Rachid (locataire)
# NB : redémarre les services pour purger le rate limiter mémoire (3 OTP/10 min/IP).
set -u

PORT=81  # passerelle Caddy (comme l utilisateur réel) — Next = 3000 direct
A="agent-browser --session a"
B="agent-browser --session b"

step() { echo ""; echo "======== $1 ========"; }
die() { echo "ÉCHEC: $1"; exit 1; }

# ── 0. Redémarrage propre des services (purge rate limiter) ─────────────
step "0. Redémarrage services"
for PAT in "next dev" "next-server" "bun --hot index.ts"; do
  pkill -f "$PAT" 2>/dev/null
done
sleep 2
cd /home/z/my-project
setsid bash -c 'cd /home/z/my-project/mini-services/chat-service && bun run dev' </dev/null >/dev/null 2>&1 &
setsid bash -c 'cd /home/z/my-project && bun run dev' </dev/null >/dev/null 2>&1 &
tries=0
until curl -s -m 3 -o /dev/null "http://localhost:$PORT/api/health"; do
  tries=$((tries+1)); [ $tries -gt 90 ] && die "Next.js pas prêt"
  sleep 1
done
echo "Next.js OK — chat-service: $(ss -tln | grep -c ':3003') écoute(s) sur 3003"

login() { # $1=cmd session, $2=téléphone
  local S="$1" PHONE="$2" CODE REF VB
  $S open "http://localhost:$PORT/#/connexion" --timeout 30000 >/dev/null 2>&1 || die "open connexion"
  $S wait 2500 >/dev/null 2>&1
  $S find label "Numéro de téléphone" fill "$PHONE" >/dev/null 2>&1 || die "fill phone $PHONE"
  $S find role button click --name "Recevoir mon code" >/dev/null 2>&1 || die "click recevoir"
  sleep 2.5
  CODE=$($S eval "document.body.innerText" 2>/dev/null | grep -oE "votre code est [0-9]+" | grep -oE "[0-9]+$")
  [ -z "$CODE" ] && { echo "  page: $($S eval 'document.body.innerText' 2>/dev/null | head -c 300)"; die "code démo absent ($PHONE)"; }
  echo "  $PHONE → code $CODE"
  R=$($S snapshot -i -c 2>/dev/null)
  REF=$(echo "$R" | grep -oE 'textbox \[ref=[^]]+\]' | head -1 | grep -oE 'e[0-9]+')
  VB=$(echo "$R" | grep -oE 'button "Vérifier le code" \[[^]]*ref=[^]]+\]' | grep -oE 'e[0-9]+')
  if [ -z "$REF" ]; then
    echo "  --- snapshot brut (lignes textbox) ---"
    echo "$R" | grep -iE "textbox|input|otp" | head -6
    echo "  --- fin ---"
    die "ref champ OTP introuvable ($PHONE)"
  fi
  [ -z "$VB" ] && die "ref bouton vérifier introuvable ($PHONE)"
  $S fill @$REF "$CODE" >/dev/null 2>&1 || die "fill OTP"
  $S click @$VB >/dev/null 2>&1 || die "click vérifier"
  sleep 2.5
  echo "  URL après vérif: $($S get url 2>/dev/null)"
}

# ── 1. Session A : Kossi → conversation avec Rachid ─────────────────────
step "1. Session A — Kossi"
$A close >/dev/null 2>&1; sleep 0.5
login "$A" "+2290197000001"
$A eval "window.location.hash='#/messagerie'" >/dev/null 2>&1
sleep 3
$A find text "Rachid Bio Tchané" click >/dev/null 2>&1 || die "clic conversation Rachid"
sleep 2
echo "  Conversation A ouverte: $($A eval "document.body.innerText" 2>/dev/null | grep -oE "Rachid Bio Tchané" | head -1)"

# ── 2. Session B : Rachid → envoi du message ────────────────────────────
step "2. Session B — Rachid envoie"
$B close >/dev/null 2>&1; sleep 0.5
login "$B" "+2290197000003"
$B eval "window.location.hash='#/messagerie'" >/dev/null 2>&1
sleep 3
$B find text "Kossi Adjovi" click >/dev/null 2>&1 || die "clic conversation Kossi"
sleep 2
MSG="TestTempsReel-$(date +%H%M%S) - visite samedi possible ?"
R=$($B snapshot -i -c 2>/dev/null)
TREF=$(echo "$R" | grep -oE 'textbox( "[^"]*")? \[ref=[^]]+\]' | tail -1 | grep -oE 'e[0-9]+')
[ -z "$TREF" ] && die "champ message introuvable côté B"
$B fill @$TREF "$MSG" >/dev/null 2>&1 || die "fill message"
$B press Enter >/dev/null 2>&1
sleep 2.5
SENT=$($B eval "document.body.innerText" 2>/dev/null | grep -c "$MSG")
echo "  Message côté B (attendu 1): $SENT"
[ "$SENT" -lt 1 ] && { $B find role button click --name "Envoyer" >/dev/null 2>&1; sleep 2; SENT=$($B eval "document.body.innerText" 2>/dev/null | grep -c "$MSG"); echo "  après clic Envoyer: $SENT"; }
[ "$SENT" -lt 1 ] && die "message jamais envoyé côté B"

# ── 3. Session A : réception temps réel SANS rechargement ───────────────
step "3. Session A — réception live (socket.io)"
sleep 4
A_TXT=$($A eval "document.body.innerText" 2>/dev/null)
RECEIVED=$(echo "$A_TXT" | grep -c "$MSG")
echo "  Message reçu côté A sans refresh (attendu 1): $RECEIVED"
if [ "$RECEIVED" -ge 1 ]; then
  echo ""
  echo "✅ TEMPS RÉEL VÉRIFIÉ — message poussé A←B via socket.io sans rechargement"
else
  echo "❌ Non reçu en direct — extrait A:"
  echo "$A_TXT" | tail -c 500
  exit 1
fi

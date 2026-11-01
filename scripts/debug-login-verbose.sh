#!/bin/bash
# Debug 2 : login complet avec erreurs visibles
set -u
PORT=3000
cd /home/z/my-project
if ! ss -tln | grep -q ':3000'; then
  setsid bash -c 'cd /home/z/my-project && bun run dev' </dev/null >/dev/null 2>&1 &
fi
tries=0; until curl -s -m 3 -o /dev/null "http://localhost:$PORT/api/health"; do tries=$((tries+1)); [ $tries -gt 60 ] && { echo TIMEOUT; exit 1; }; sleep 1; done
echo "server OK"
S="agent-browser --session dbg"
$S close >/dev/null 2>&1
$S open "http://localhost:$PORT/#/connexion" --timeout 30000 >/dev/null 2>&1
$S wait 2500 >/dev/null 2>&1
$S find label "Numéro de téléphone" fill "+2290197000001"
$S find role button click --name "Recevoir mon code"
sleep 2.5
CODE=$($S eval "document.body.innerText" 2>/dev/null | grep -oE "votre code est [0-9]+" | grep -oE "[0-9]+$")
echo "CODE=[$CODE]"
if [ -z "$CODE" ]; then $S eval "document.body.innerText" 2>/dev/null | head -c 400; echo; fi
R=$($S snapshot -i -c 2>&1)
echo "RAW_LINE: $(echo "$R" | grep -nE '^-. textbox \[ref=' | head -2)"
REF=$(echo "$R" | grep -E '^-. textbox \[ref=' | head -1 | grep -oE 'e[0-9]+')
VB=$(echo "$R" | grep -oE 'button "Vérifier le code" \[ref=[^]]+\]' | grep -oE 'e[0-9]+')
echo "REF=[$REF] VB=[$VB]"
echo "--- fill ---"
$S fill @$REF "$CODE"
echo "--- click ---"
$S click @$VB
sleep 2.5
echo "URL: $($S get url 2>&1)"

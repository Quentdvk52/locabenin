#!/bin/bash
# Debug : snapshot à l'étape OTP
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
echo "=== SNAPSHOT OTP STEP ==="
$S snapshot -i -c 2>&1

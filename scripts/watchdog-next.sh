#!/bin/bash
# Chien de garde LocaBénin : relance Next.js (:3000) s'il tombe.
# Lancer détaché :  setsid bash /home/z/my-project/scripts/watchdog-next.sh &
PROJECT_DIR="/home/z/my-project"
LOG="$PROJECT_DIR/dev.log"

while true; do
  if ! curl -s -o /dev/null --max-time 5 http://localhost:3000/ ; then
    echo "[$(date '+%F %T')] :3000 injoignable -> relance Next.js" >> "$LOG"
    # tue un éventuel process zombie avant redémarrage
    pkill -f 'next-server' 2>/dev/null
    sleep 1
    cd "$PROJECT_DIR" || exit 1
    setsid nohup bun run dev >> "$LOG" 2>&1 &
    # attend que le port réponde (max 60 s)
    for i in $(seq 1 30); do
      sleep 2
      curl -s -o /dev/null --max-time 3 http://localhost:3000/ && break
    done
    echo "[$(date '+%F %T')] relance terminée" >> "$LOG"
  fi
  sleep 30
done

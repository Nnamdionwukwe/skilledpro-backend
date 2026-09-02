 
#!/bin/bash
# Log rotation script

LOG_DIR="/var/www/skilledproz-backend/logs"
MAX_FILES=10
MAX_SIZE=10485760 # 10MB

echo "🔄 Rotating logs..."

for log in combined error warn info security wallet database; do
  LOG_FILE="$LOG_DIR/${log}.log"
  if [ -f "$LOG_FILE" ]; then
    SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt "$MAX_SIZE" ]; then
      # Rotate the log
      for i in $(seq $MAX_FILES -1 1); do
        if [ -f "$LOG_DIR/${log}.log.$i" ]; then
          if [ $i -eq $MAX_FILES ]; then
            rm -f "$LOG_DIR/${log}.log.$i"
          else
            mv "$LOG_DIR/${log}.log.$i" "$LOG_DIR/${log}.log.$((i+1))"
          fi
        fi
      done
      mv "$LOG_FILE" "$LOG_DIR/${log}.log.1"
      touch "$LOG_FILE"
      echo "✅ Rotated: $log.log"
    fi
  fi
done

echo "✅ Log rotation complete" 
 
#!/bin/bash

# Log viewer script
LOG_DIR="/var/www/skilledproz-backend/logs"

show_help() {
  echo "Usage: ./view-logs.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -f, --file FILE     Log file to view (combined, error, warn, info, security, wallet)"
  echo "  -l, --lines NUM     Number of lines to show (default: 50)"
  echo "  -t, --tail          Tail the log (follow)"
  echo "  -s, --search TERM   Search for a term in the log"
  echo "  -h, --help          Show this help"
  echo ""
  echo "Examples:"
  echo "  ./view-logs.sh -f error -l 100"
  echo "  ./view-logs.sh -f security -t"
  echo "  ./view-logs.sh -s 'wallet'"
}

FILE="combined"
LINES=50
TAIL=false
SEARCH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--file)
      FILE="$2"
      shift 2
      ;;
    -l|--lines)
      LINES="$2"
      shift 2
      ;;
    -t|--tail)
      TAIL=true
      shift
      ;;
    -s|--search)
      SEARCH="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

LOG_FILE="$LOG_DIR/${FILE}.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "❌ Log file not found: $LOG_FILE"
  exit 1
fi

if [ "$TAIL" = true ]; then
  echo "📄 Tailing $FILE.log (press Ctrl+C to stop)"
  tail -f "$LOG_FILE"
elif [ -n "$SEARCH" ]; then
  echo "🔍 Searching for '$SEARCH' in $FILE.log"
  grep -n "$SEARCH" "$LOG_FILE" | tail -$LINES
else
  echo "📄 Showing last $LINES lines of $FILE.log"
  tail -$LINES "$LOG_FILE"
fi 
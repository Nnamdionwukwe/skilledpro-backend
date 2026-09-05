#!/bin/bash

echo "========================================="
echo "🔄 PROJECT-SERVER SYNC CHECK"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Server details
SERVER_USER="root"
SERVER_IP="167.172.142.200"
SERVER_PATH="/var/www/skilledproz-backend"
LOCAL_PATH="."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Not in project root directory${NC}"
    echo "Please run this script from your local project root"
    exit 1
fi

echo -e "${BLUE}📁 Local project: $(pwd)${NC}"
echo -e "${BLUE}🌐 Server: ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}${NC}"
echo ""

# Function to compare file
compare_file() {
    local file=$1
    
    # Get local file hash
    local local_hash=$(md5sum "$file" 2>/dev/null | awk '{print $1}')
    
    # Get server file hash
    local server_hash=$(ssh ${SERVER_USER}@${SERVER_IP} "md5sum ${SERVER_PATH}/$file 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
    
    if [ -z "$local_hash" ] && [ -z "$server_hash" ]; then
        echo "both_missing"
    elif [ -z "$local_hash" ]; then
        echo "local_missing"
    elif [ -z "$server_hash" ]; then
        echo "server_missing"
    elif [ "$local_hash" == "$server_hash" ]; then
        echo "identical"
    else
        echo "different"
    fi
}

# ── 1. Check key files ──────────────────────────────────────────────────
echo -e "${BLUE}📋 1. CHECKING KEY FILES${NC}"
echo "========================================"

KEY_FILES=(
    "package.json"
    "prisma/schema.prisma"
    "src/app.js"
    "src/config/database.js"
    "src/controllers/booking.controller.js"
    "src/controllers/payment.controller.js"
    "src/services/notification.service.js"
    "src/services/payment.service.js"
    "src/services/refund.service.js"
    "src/controllers/refund.controller.js"
    "src/controllers/refund.dispute.controller.js"
    "src/controllers/admin.refund.controller.js"
    "src/routes/refund.routes.js"
    "src/routes/dispute.routes.js"
)

SYNC_STATUS=()

for file in "${KEY_FILES[@]}"; do
    echo -e "${BLUE}Checking: $file${NC}"
    
    status=$(compare_file "$file")
    
    case $status in
        "identical")
            echo -e "  ${GREEN}✅ Identical${NC}"
            SYNC_STATUS+=("identical:$file")
            ;;
        "different")
            echo -e "  ${RED}❌ Different${NC}"
            SYNC_STATUS+=("different:$file")
            ;;
        "local_missing")
            echo -e "  ${RED}❌ Local missing${NC}"
            SYNC_STATUS+=("local_missing:$file")
            ;;
        "server_missing")
            echo -e "  ${GREEN}📤 Server missing${NC}"
            SYNC_STATUS+=("server_missing:$file")
            ;;
        "both_missing")
            echo -e "  ${YELLOW}⚠️  Missing in both${NC}"
            SYNC_STATUS+=("both_missing:$file")
            ;;
    esac
done

# ── 3. Summary ──────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}📊 3. SYNC SUMMARY${NC}"
echo "========================================"

IDENTICAL=0
DIFFERENT=0
LOCAL_MISSING=0
SERVER_MISSING=0
BOTH_MISSING=0

for status in "${SYNC_STATUS[@]}"; do
    case $status in
        identical:*) IDENTICAL=$((IDENTICAL + 1)) ;;
        different:*) DIFFERENT=$((DIFFERENT + 1)) ;;
        local_missing:*) LOCAL_MISSING=$((LOCAL_MISSING + 1)) ;;
        server_missing:*) SERVER_MISSING=$((SERVER_MISSING + 1)) ;;
        both_missing:*) BOTH_MISSING=$((BOTH_MISSING + 1)) ;;
    esac
done

echo -e "${GREEN}✅ Identical: $IDENTICAL${NC}"
echo -e "${RED}❌ Different: $DIFFERENT${NC}"
echo -e "${RED}📥 Local missing: $LOCAL_MISSING${NC}"
echo -e "${GREEN}📤 Server missing: $SERVER_MISSING${NC}"
echo -e "${YELLOW}⚠️  Missing in both: $BOTH_MISSING${NC}"

echo ""
if [ $DIFFERENT -gt 0 ] || [ $LOCAL_MISSING -gt 0 ] || [ $SERVER_MISSING -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Files need to be synced!${NC}"
    echo ""
    echo -e "${BLUE}📝 Files with differences:${NC}"
    for status in "${SYNC_STATUS[@]}"; do
        if [[ $status == different:* ]]; then
            echo -e "  ${RED}❌${NC} ${status#different:}"
        elif [[ $status == local_missing:* ]]; then
            echo -e "  ${RED}📥${NC} ${status#local_missing:} (local missing)"
        elif [[ $status == server_missing:* ]]; then
            echo -e "  ${GREEN}📤${NC} ${status#server_missing:} (server missing)"
        fi
    done
else
    echo -e "${GREEN}🎉 All files are in sync!${NC}"
fi

echo ""
echo "========================================="
echo "✅ SYNC CHECK COMPLETE"
echo "========================================="

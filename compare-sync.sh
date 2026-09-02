cat > /tmp/compare-sync.sh << 'EOF'
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

# Function to check if file exists on server
check_file_exists() {
    ssh ${SERVER_USER}@${SERVER_IP} "test -f ${SERVER_PATH}/$1 && echo 'exists' || echo 'missing'" 2>/dev/null
}

# Function to compare file content
compare_file() {
    local local_file=$1
    local server_file=$2
    
    # Get local file hash
    local local_hash=$(md5sum "$local_file" 2>/dev/null | awk '{print $1}')
    
    # Get server file hash
    local server_hash=$(ssh ${SERVER_USER}@${SERVER_IP} "md5sum ${SERVER_PATH}/$server_file 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
    
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

# Function to get line count
get_line_count() {
    local file=$1
    if [ -f "$file" ]; then
        wc -l < "$file" 2>/dev/null | tr -d ' '
    else
        echo "0"
    fi
}

# Function to show function differences
show_function_differences() {
    local local_file=$1
    local server_file=$2
    
    echo -e "${YELLOW}🔍 Function differences for: $server_file${NC}"
    echo "----------------------------------------"
    
    # Extract function names from local file
    local local_functions=$(grep -E "^export (const|function|async function)" "$local_file" 2>/dev/null | sed 's/.*\(export const\|export function\|export async function\) \([a-zA-Z0-9_]*\).*/\2/' | sort)
    
    # Extract function names from server file
    local server_functions=$(ssh ${SERVER_USER}@${SERVER_IP} "grep -E '^export (const|function|async function)' ${SERVER_PATH}/$server_file 2>/dev/null | sed 's/.*\(export const\|export function\|export async function\) \([a-zA-Z0-9_]*\).*/\2/' | sort" 2>/dev/null)
    
    echo ""
    echo -e "${BLUE}📝 Functions in LOCAL:${NC}"
    if [ -n "$local_functions" ]; then
        echo "$local_functions" | sed 's/^/  ✅ /'
    else
        echo "  (none found)"
    fi
    
    echo ""
    echo -e "${BLUE}📝 Functions in SERVER:${NC}"
    if [ -n "$server_functions" ]; then
        echo "$server_functions" | sed 's/^/  ✅ /'
    else
        echo "  (none found)"
    fi
    
    # Compare function lists
    local missing_in_local=$(comm -23 <(echo "$server_functions") <(echo "$local_functions"))
    local missing_in_server=$(comm -13 <(echo "$server_functions") <(echo "$local_functions"))
    
    if [ -n "$missing_in_local" ]; then
        echo ""
        echo -e "${RED}❌ Functions in SERVER but NOT in LOCAL:${NC}"
        echo "$missing_in_local" | sed 's/^/  ⚠️ /'
    fi
    
    if [ -n "$missing_in_server" ]; then
        echo ""
        echo -e "${GREEN}📤 Functions in LOCAL but NOT in SERVER:${NC}"
        echo "$missing_in_server" | sed 's/^/  📤 /'
    fi
    
    echo ""
}

# Function to show file details
show_file_details() {
    local local_file=$1
    local server_file=$2
    local status=$3
    
    local local_lines=$(get_line_count "$local_file")
    local server_lines=$(ssh ${SERVER_USER}@${SERVER_IP} "wc -l < ${SERVER_PATH}/$server_file 2>/dev/null | tr -d ' '" 2>/dev/null)
    
    case $status in
        "identical")
            echo -e "${GREEN}✅ IDENTICAL${NC} - $local_file"
            echo "   Local: $local_lines lines | Server: $server_lines lines"
            ;;
        "different")
            echo -e "${RED}❌ DIFFERENT${NC} - $local_file"
            echo "   Local: $local_lines lines | Server: $server_lines lines"
            show_function_differences "$local_file" "$server_file"
            ;;
        "local_missing")
            echo -e "${RED}❌ MISSING IN LOCAL${NC} - $server_file"
            echo "   Server: $server_lines lines"
            ;;
        "server_missing")
            echo -e "${GREEN}📤 NOT ON SERVER${NC} - $local_file"
            echo "   Local: $local_lines lines"
            ;;
        "both_missing")
            echo -e "${YELLOW}⚠️  MISSING IN BOTH${NC} - $local_file"
            ;;
    esac
    echo ""
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
    "src/controllers/wallet.controller.js"
    "src/services/notification.service.js"
    "src/services/payment.service.js"
    "src/services/refund.service.js"
    "src/controllers/refund.controller.js"
    "src/controllers/admin/admin.refund.controller.js"
    "src/controllers/refund.dispute.controller.js"
    "src/routes/refund.routes.js"
    "src/routes/dispute.routes.js"
)

SYNC_STATUS=()

for file in "${KEY_FILES[@]}"; do
    echo -e "${BLUE}Checking: $file${NC}"
    
    local_file="$LOCAL_PATH/$file"
    server_file="$file"
    
    # Check if file exists locally
    if [ -f "$local_file" ]; then
        local_exists=true
    else
        local_exists=false
    fi
    
    # Check if file exists on server
    server_exists=$(ssh ${SERVER_USER}@${SERVER_IP} "test -f ${SERVER_PATH}/$server_file && echo 'true' || echo 'false'" 2>/dev/null)
    
    if [ "$local_exists" = true ] && [ "$server_exists" = true ]; then
        # Both exist - compare content
        local_hash=$(md5sum "$local_file" 2>/dev/null | awk '{print $1}')
        server_hash=$(ssh ${SERVER_USER}@${SERVER_IP} "md5sum ${SERVER_PATH}/$server_file 2>/dev/null | awk '{print \$1}'" 2>/dev/null)
        
        if [ "$local_hash" == "$server_hash" ]; then
            echo -e "  ${GREEN}✅ Identical${NC}"
            SYNC_STATUS+=("identical:$file")
        else
            echo -e "  ${RED}❌ Different${NC}"
            SYNC_STATUS+=("different:$file")
        fi
    elif [ "$local_exists" = true ] && [ "$server_exists" = false ]; then
        echo -e "  ${GREEN}📤 Local only${NC}"
        SYNC_STATUS+=("local_only:$file")
    elif [ "$local_exists" = false ] && [ "$server_exists" = true ]; then
        echo -e "  ${RED}❌ Server only${NC}"
        SYNC_STATUS+=("server_only:$file")
    else
        echo -e "  ${YELLOW}⚠️  Missing in both${NC}"
        SYNC_STATUS+=("missing_both:$file")
    fi
done

# ── 2. Check controller functions ──────────────────────────────────────
echo ""
echo -e "${BLUE}📋 2. CONTROLLER FUNCTION CHECK${NC}"
echo "========================================"

CONTROLLER_FILES=(
    "src/controllers/booking.controller.js"
    "src/controllers/payment.controller.js"
    "src/controllers/wallet.controller.js"
    "src/controllers/auth.controller.js"
    "src/controllers/user.controller.js"
)

for file in "${CONTROLLER_FILES[@]}"; do
    echo -e "${BLUE}📄 $file${NC}"
    
    local_functions=$(grep -E "^export (const|function|async function)" "$LOCAL_PATH/$file" 2>/dev/null | sed 's/.*\(export const\|export function\|export async function\) \([a-zA-Z0-9_]*\).*/\2/' | sort | head -10)
    server_functions=$(ssh ${SERVER_USER}@${SERVER_IP} "grep -E '^export (const|function|async function)' ${SERVER_PATH}/$file 2>/dev/null | sed 's/.*\(export const\|export function\|export async function\) \([a-zA-Z0-9_]*\).*/\2/' | sort | head -10" 2>/dev/null)
    
    echo "  Local functions: $(echo "$local_functions" | wc -l)"
    echo "  Server functions: $(echo "$server_functions" | wc -l)"
    
    # Compare first 5 functions
    local_sample=$(echo "$local_functions" | head -5)
    server_sample=$(echo "$server_functions" | head -5)
    
    if [ "$local_sample" != "$server_sample" ]; then
        echo -e "  ${YELLOW}⚠️  Function lists differ${NC}"
        echo "  Local first 5: $local_sample"
        echo "  Server first 5: $server_sample"
    else
        echo -e "  ${GREEN}✅ Function lists match${NC}"
    fi
    echo ""
done

# ── 3. Summary ──────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}📊 3. SYNC SUMMARY${NC}"
echo "========================================"

IDENTICAL=0
DIFFERENT=0
LOCAL_ONLY=0
SERVER_ONLY=0
MISSING_BOTH=0

for status in "${SYNC_STATUS[@]}"; do
    case $status in
        identical:*) IDENTICAL=$((IDENTICAL + 1)) ;;
        different:*) DIFFERENT=$((DIFFERENT + 1)) ;;
        local_only:*) LOCAL_ONLY=$((LOCAL_ONLY + 1)) ;;
        server_only:*) SERVER_ONLY=$((SERVER_ONLY + 1)) ;;
        missing_both:*) MISSING_BOTH=$((MISSING_BOTH + 1)) ;;
    esac
done

echo -e "${GREEN}✅ Identical: $IDENTICAL${NC}"
echo -e "${RED}❌ Different: $DIFFERENT${NC}"
echo -e "${GREEN}📤 Local only: $LOCAL_ONLY${NC}"
echo -e "${RED}📥 Server only: $SERVER_ONLY${NC}"
echo -e "${YELLOW}⚠️  Missing in both: $MISSING_BOTH${NC}"

echo ""
if [ $DIFFERENT -gt 0 ] || [ $SERVER_ONLY -gt 0 ] || [ $LOCAL_ONLY -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Files need to be synced!${NC}"
    echo ""
    echo -e "${BLUE}📝 Files with differences:${NC}"
    for status in "${SYNC_STATUS[@]}"; do
        if [[ $status == different:* ]]; then
            echo -e "  ${RED}❌${NC} ${status#different:}"
        elif [[ $status == local_only:* ]]; then
            echo -e "  ${GREEN}📤${NC} ${status#local_only:} (local only)"
        elif [[ $status == server_only:* ]]; then
            echo -e "  ${RED}📥${NC} ${status#server_only:} (server only)"
        fi
    done
else
    echo -e "${GREEN}🎉 All files are in sync!${NC}"
fi

echo ""
echo "========================================="
echo "✅ SYNC CHECK COMPLETE"
echo "========================================="
EOF

chmod +x /tmp/compare-sync.sh
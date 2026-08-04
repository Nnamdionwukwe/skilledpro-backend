#!/bin/bash

# ── Colors ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🚀 SkilledProz Deploy to DigitalOcean            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

# ── Configuration ──
DROPLET_IP="167.172.142.200"
DROPLET_USER="root"
PROJECT_PATH="/var/www/skilledproz-backend"

# ── Step 1: Deploy to DigitalOcean ──
echo -e "\n${YELLOW}📦 Deploying to DigitalOcean...${NC}"

ssh root@$DROPLET_IP << EOF
    echo -e "${YELLOW}   📂 Pulling latest code from GitHub...${NC}"
    cd $PROJECT_PATH
    git pull
    
    if [ \$? -eq 0 ]; then
        echo -e "${GREEN}   ✅ Code pulled successfully!${NC}"
    else
        echo -e "${RED}   ❌ Git pull failed.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}   📦 Installing dependencies...${NC}"
    npm install
    
    echo -e "${YELLOW}   🔄 Restarting PM2...${NC}"
    pm2 restart skilledproz-api
    
    if [ \$? -eq 0 ]; then
        echo -e "${GREEN}   ✅ PM2 restarted successfully!${NC}"
    else
        echo -e "${RED}   ❌ PM2 restart failed.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}   📋 Checking server status...${NC}"
    pm2 status
    
    echo -e "${YELLOW}   🔍 Testing health endpoint...${NC}"
    curl -s http://localhost:5000/health
EOF

# ── Step 2: Check Deployment ──
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✅ DEPLOYMENT SUCCESSFUL!                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo -e "\n${BLUE}📊 Deployment Info:${NC}"
    echo -e "   🌐 Backend URL: http://$DROPLET_IP:5000"
    echo -e "   ❤️  Health Check: http://$DROPLET_IP:5000/health"
    echo -e "\n${GREEN}✨ Deployment complete! 🚀${NC}"
else
    echo -e "\n${RED}❌ Deployment failed. Please check the errors above.${NC}"
    exit 1
fi

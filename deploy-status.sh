#!/bin/bash

echo -e "\033[0;34m📊 Server Status\033[0m"
ssh root@167.172.142.200 << 'EOF'
echo ""
echo "📋 PM2 Status:"
pm2 status
echo ""
echo "📋 Last 10 Log Lines:"
pm2 logs skilledproz-api --lines 10
echo ""
echo "📋 Health Check:"
curl -s http://localhost:5000/health
EOF
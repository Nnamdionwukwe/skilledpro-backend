 
#!/bin/bash
# Simple monitoring script

echo "📊 SkilledProz API Monitoring"
echo "=============================="
echo ""

# Check PM2 status
echo "🔹 PM2 Status:"
pm2 status

echo ""
echo "🔹 Recent Errors:"
tail -20 /var/www/skilledproz-backend/logs/error.log 2>/dev/null || echo "No errors found"

echo ""
echo "🔹 Recent Security Events:"
tail -10 /var/www/skilledproz-backend/logs/security.log 2>/dev/null || echo "No security events"

echo ""
echo "🔹 Server Load:"
uptime

echo ""
echo "🔹 Memory Usage:"
free -h

echo ""
echo "🔹 Disk Usage:"
df -h / | tail -1
EOF

chmod +x scripts/monitor.sh

# Run the monitor 
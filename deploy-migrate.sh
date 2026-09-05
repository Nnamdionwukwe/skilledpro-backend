#!/bin/bash

echo -e "\033[0;34m🚀 Deploying with migrations...\033[0m"

ssh root@167.172.142.200 << 'EOF'
cd /var/www/skilledproz-backend
echo "📂 Pulling latest code..."
git pull

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Running database migrations..."
prisma generate
prisma migrate deploy

echo "🔄 Restarting PM2..."
pm2 restart skilledproz-api

echo "✅ Deployment complete!"
EOF
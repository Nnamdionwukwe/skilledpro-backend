#!/bin/bash

echo "========================================="
echo "🔄 SYNCING FILES WITH SERVER"
echo "========================================="

SERVER="root@167.172.142.200"
SERVER_PATH="/var/www/skilledproz-backend"

echo "📥 Copying server files to local..."
echo ""

# 1. Copy different files from server to local
echo "1. Copying package.json..."
scp $SERVER:$SERVER_PATH/package.json ./

echo "2. Copying prisma/schema.prisma..."
scp $SERVER:$SERVER_PATH/prisma/schema.prisma ./prisma/

echo "3. Copying src/app.js..."
scp $SERVER:$SERVER_PATH/src/app.js ./src/

echo "4. Copying src/config/database.js..."
scp $SERVER:$SERVER_PATH/src/config/database.js ./src/config/

echo "5. Copying src/controllers/booking.controller.js..."
scp $SERVER:$SERVER_PATH/src/controllers/booking.controller.js ./src/controllers/

echo "6. Copying src/controllers/wallet.controller.js..."
scp $SERVER:$SERVER_PATH/src/controllers/wallet.controller.js ./src/controllers/ 2>/dev/null || echo "  ⚠️  wallet.controller.js not found on server"

echo ""
echo "✅ Server files copied to local!"

echo ""
echo "📤 Uploading new refund files to server..."
echo ""

# 2. Upload new refund files to server
echo "7. Uploading src/services/refund.service.js..."
scp src/services/refund.service.js $SERVER:$SERVER_PATH/src/services/

echo "8. Uploading src/controllers/refund.controller.js..."
scp src/controllers/refund.controller.js $SERVER:$SERVER_PATH/src/controllers/

echo "9. Uploading src/controllers/refund.dispute.controller.js..."
scp src/controllers/refund.dispute.controller.js $SERVER:$SERVER_PATH/src/controllers/

echo "10. Uploading src/routes/refund.routes.js..."
scp src/routes/refund.routes.js $SERVER:$SERVER_PATH/src/routes/

echo "11. Creating admin directory and uploading admin.refund.controller.js..."
ssh $SERVER "mkdir -p $SERVER_PATH/src/controllers/admin"
scp src/controllers/admin/admin.refund.controller.js $SERVER:$SERVER_PATH/src/controllers/admin/

echo ""
echo "✅ All files synced!"

echo ""
echo "========================================="
echo "🔄 VERIFYING SYNC..."
echo "========================================="

# 3. Run the compare script again to verify
./compare-sync.sh
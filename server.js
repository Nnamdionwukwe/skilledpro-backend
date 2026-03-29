// ⚠️  "import" statements are hoisted in ES modules — ALL imports run before
// any code executes. So dotenv.config() called after imports is already too late.
// The ONLY reliable fix is to make dotenv load via an import statement itself,
// which guarantees it runs before other imports that need env vars.

import "dotenv/config"; //  ← must be the FIRST import — loads .env before anything else

import app from "./src/app.js";
import { createServer } from "http";
import { initSocket } from "./src/socket/index.js";

const PORT = process.env.PORT || 5001;
const httpServer = createServer(app);

initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`✅ SkilledPro server running on port ${PORT}`);
});

//skilledpro-backend-production.up.railway.app

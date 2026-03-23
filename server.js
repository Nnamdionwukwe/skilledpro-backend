import dotenv from "dotenv";
dotenv.config({ override: true });
import app from "./src/app.js";
import { createServer } from "http";
import { initSocket } from "./src/socket/index.js";

const PORT = process.env.PORT || 5001;
const httpServer = createServer(app);

initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`✅ SkilledPro server running on port ${PORT}`);
});

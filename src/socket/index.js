// src/socket/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO bootstrap.
//
// Registers:
//   • Auth middleware on the default namespace
//   • The /voice-calls namespace (voice/video call signaling)
//   • The /support namespace (support live chat)
//   • Chat/message handlers on the default namespace
//
// NOTE: `io.use(mw)` only applies to the DEFAULT namespace. Custom namespaces
// (created with `io.of(...)`) need their own `.use(mw)` call. Both
// registerVoiceCallSocket() and registerSupportChatSocket() handle this
// internally via nsp.use(socketAuthMiddleware).
//
// Timings:
//   • pingInterval / pingTimeout are tuned for mobile. Mobile browsers
//     throttle background tabs, and aggressive servers may drop a WebSocket
//     if the client misses a ping. We allow a longer window so brief
//     network hiccups don't kill the call mid-handshake.
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "socket.io";
import registerVoiceCallSocket from "./voiceCallSocket.js";
import registerSupportChatSocket from "./supportChatSocket.js"; // ← NEW
import socketAuthMiddleware from "./authMiddleware.js";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "https://www.skilledproz.com",
        "https://skilledproz.com",
      ],
      credentials: true,
    },
    pingInterval: 20000,
    pingTimeout: 25000,
    transports: ["polling", "websocket"],
    maxHttpBufferSize: 1e6,
    allowUpgrades: true,
    connectTimeout: 45000,
  });

  // Auth middleware for the default namespace ("/").
  io.use(socketAuthMiddleware);

  // Register the /voice-calls namespace.
  registerVoiceCallSocket(io);

  // Register the /support namespace (support live chat).
  registerSupportChatSocket(io); // ← NEW

  // ── Default namespace: chat / messaging ─────────────────────────────
  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.userId} (${socket.id})`);
    socket.join(`user:${socket.userId}`);

    socket.on("join:conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("leave:conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("message:send", (data) => {
      io.to(`conversation:${data.conversationId}`).emit("message:receive", {
        ...data,
        senderId: socket.userId,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("typing:start", ({ conversationId }) => {
      socket
        .to(`conversation:${conversationId}`)
        .emit("typing:start", { userId: socket.userId });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      socket
        .to(`conversation:${conversationId}`)
        .emit("typing:stop", { userId: socket.userId });
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `🔴 User disconnected: ${socket.userId} (${socket.id}) — ${reason}`,
      );
      io.emit("user:offline", { userId: socket.userId });
    });

    socket.broadcast.emit("user:online", { userId: socket.userId });
  });

  return io;
};

export const getIO = () => {
  if (!io) console.warn("Socket.io not initialised yet");
  return io;
};

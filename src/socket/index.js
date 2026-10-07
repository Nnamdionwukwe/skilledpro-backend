// src/socket/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO bootstrap.
//
// Registers:
//   • Auth middleware on the default namespace
//   • The /voice-calls namespace (which attaches the same auth middleware)
//   • Chat/message handlers on the default namespace
//
// NOTE: `io.use(mw)` only applies to the DEFAULT namespace. Custom namespaces
// (created with `io.of(...)`) need their own `.use(mw)` call. The voice
// namespace handles this inside registerVoiceCallSocket().
//
// Timings:
//   • pingInterval / pingTimeout are tuned for mobile. Mobile browsers
//     throttle background tabs, and aggressive servers may drop a WebSocket
//     if the client misses a ping. We allow a longer window so brief
//     network hiccups don't kill the call mid-handshake.
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "socket.io";
import registerVoiceCallSocket from "./voiceCallSocket.js";
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
    // ── Heartbeat tuning ─────────────────────────────────────────────
    // Default is 25s / 20s. We loosen it to tolerate mobile hiccups and
    // long GC pauses on low-end devices. The client sends a ping every
    // 20s; if we don't hear back within 25s, we consider the connection
    // dead. Higher values = more forgiving, slightly slower to detect
    // true dead sockets.
    pingInterval: 20000,
    pingTimeout: 25000,
    // Accept polling upgrade then switch to websocket. WebSocket-first
    // would be faster but breaks behind some corporate proxies.
    transports: ["polling", "websocket"],
    // Increase max payload size for SDP / ICE (default 1MB is plenty but
    // we're explicit here to avoid surprises).
    maxHttpBufferSize: 1e6,
    // Allow upgrades from polling → websocket. If a proxy blocks the
    // upgrade, we silently stay on polling instead of dying.
    allowUpgrades: true,
    // Don't kill idle connections aggressively. Mobile apps stay
    // connected for long stretches with no activity.
    connectTimeout: 45000,
  });

  // Auth middleware for the default namespace ("/").
  io.use(socketAuthMiddleware);

  // Register the /voice-calls namespace. It attaches the same auth
  // middleware internally via nsp.use(socketAuthMiddleware).
  registerVoiceCallSocket(io);

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

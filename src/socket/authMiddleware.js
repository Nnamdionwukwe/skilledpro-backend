// src/socket/authMiddleware.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared Socket.IO auth middleware.
//
// IMPORTANT: In Socket.IO v4, `io.use(mw)` only registers middleware on the
// DEFAULT namespace ("/"). Namespaces created with `io.of("/name")` have
// their OWN middleware chain and DO NOT inherit the default's.
//
// So this middleware has to be attached explicitly to every namespace:
//   io.use(socketAuthMiddleware);           // for the default namespace
//   io.of("/voice-calls").use(socketAuthMiddleware);   // for voice-calls
//
// On success, it sets `socket.userId` to the authenticated user's id.
// ─────────────────────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";

export default function socketAuthMiddleware(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.split(" ")[1];

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.warn("[socket auth] JWT verify failed:", err.message);
    next(new Error("Invalid token"));
  }
}

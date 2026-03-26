import { Server } from "socket.io";
import jwt from "jsonwebtoken";

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
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.userId}`);
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

    socket.on("disconnect", () => {
      console.log(`🔴 User disconnected: ${socket.userId}`);
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

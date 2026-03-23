import { Server } from "socket.io";

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`);

    socket.on("join", (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their room`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

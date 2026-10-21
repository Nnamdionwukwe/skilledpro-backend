import { io } from "socket.io-client";

const API = "http://localhost:5000";
const CHAT_ID = process.argv[2];
const USER_TOKEN = process.argv[3];
const ADMIN_TOKEN = process.argv[4];

const userSocket = io(API, {
  path: "/socket/support",
  auth: { token: USER_TOKEN },
});
const adminSocket = io(API, {
  path: "/socket/support",
  auth: { token: ADMIN_TOKEN },
});

userSocket.on("connect", () => {
  userSocket.emit("support:join", { conversationId: CHAT_ID }, (res) => {
    console.log("[user] joined", res);
  });
});

adminSocket.on("connect", () => {
  adminSocket.emit("support:join", { conversationId: CHAT_ID }, (res) => {
    console.log("[admin] joined", res);

    adminSocket.on("support:message", (msg) => {
      console.log("[admin] received:", msg.body || msg.systemEvent);
    });

    setTimeout(() => {
      userSocket.emit(
        "support:message",
        { conversationId: CHAT_ID, body: "Test from user" },
        (ack) => console.log("[user] sent", ack),
      );
    }, 500);

    setTimeout(() => {
      adminSocket.emit("support:typing", {
        conversationId: CHAT_ID,
        isTyping: true,
      });
    }, 1000);
  });
});

userSocket.on("support:typing", (evt) => {
  console.log("[user] sees admin typing:", evt);
});

setTimeout(() => process.exit(0), 5000);

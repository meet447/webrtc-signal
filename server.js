// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const port = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("✅ VoiceSignal multi-user signaling server running!"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = {}; // { roomId: { userId: ws } }

function broadcast(roomId, message, excludeUserId = null) {
  if (!rooms[roomId]) return;
  for (const [userId, client] of Object.entries(rooms[roomId])) {
    if (client.readyState === client.OPEN && userId !== excludeUserId) {
      client.send(JSON.stringify(message));
    }
  }
}

wss.on("connection", (ws) => {
  let currentRoom = null;
  let currentUserId = null;

  console.log("🟢 New WebSocket connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!data.type) return;

      switch (data.type) {
        case "join":
          currentRoom = data.roomId;
          currentUserId = data.userId;

          if (!rooms[currentRoom]) rooms[currentRoom] = {};
          rooms[currentRoom][currentUserId] = ws;

          console.log(`👤 ${currentUserId} joined room ${currentRoom}`);

          // Send list of existing users to the new joiner
          const existingUsers = Object.keys(rooms[currentRoom]).filter((u) => u !== currentUserId);
          ws.send(JSON.stringify({ type: "users-in-room", users: existingUsers }));

          // Notify others of new user
          broadcast(currentRoom, { type: "user-joined", userId: currentUserId }, currentUserId);
          break;

        case "offer":
        case "answer":
        case "ice":
          // Forward to the target peer only
          const targetId = data.target;
          if (targetId && rooms[currentRoom]?.[targetId]) {
            rooms[currentRoom][targetId].send(
              JSON.stringify({ ...data, from: currentUserId })
            );
          }
          break;

        default:
          console.log("⚠️ Unknown message type:", data.type);
      }
    } catch (err) {
      console.error("❌ Message error:", err);
    }
  });

  ws.on("close", () => {
    if (currentRoom && currentUserId && rooms[currentRoom]) {
      delete rooms[currentRoom][currentUserId];
      broadcast(currentRoom, { type: "user-left", userId: currentUserId });

      console.log(`❌ ${currentUserId} left ${currentRoom}`);

      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
        console.log(`🧹 Deleted empty room ${currentRoom}`);
      }
    }
  });

  ws.on("pong", () => (ws.isAlive = true));
});

// Keep WebSocket connections alive (Render workaround)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(port, () =>
  console.log(`🚀 Multi-user VoiceSignal server running on port ${port}`)
);
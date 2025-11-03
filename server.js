// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ VoiceSignal signaling server is running!");
});

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

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      switch (data.type) {
        case "join":
          currentRoom = data.roomId;
          currentUserId = data.userId;
          if (!rooms[currentRoom]) rooms[currentRoom] = {};
          rooms[currentRoom][currentUserId] = ws;
          console.log(`👤 ${currentUserId} joined room ${currentRoom}`);

          // Notify others
          broadcast(currentRoom, { type: "user-joined", userId: currentUserId }, currentUserId);

          // If 2 people in room, signal "ready"
          if (Object.keys(rooms[currentRoom]).length === 2) {
            const users = Object.keys(rooms[currentRoom]);
            const [caller, callee] = users;
            rooms[currentRoom][caller].send(JSON.stringify({ type: "ready", role: "caller" }));
            rooms[currentRoom][callee].send(JSON.stringify({ type: "ready", role: "callee" }));
          }
          break;

        case "offer":
        case "answer":
        case "ice":
          broadcast(currentRoom, { ...data, from: currentUserId }, currentUserId);
          break;

        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    if (currentRoom && currentUserId && rooms[currentRoom]) {
      delete rooms[currentRoom][currentUserId];
      console.log(`❌ ${currentUserId} left ${currentRoom}`);

      broadcast(currentRoom, { type: "user-left", userId: currentUserId });
      if (Object.keys(rooms[currentRoom]).length === 0) delete rooms[currentRoom];
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Signaling server running on port ${PORT}`));
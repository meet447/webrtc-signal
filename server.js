// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const port = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ VoiceSignal signaling server is running!");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * Room structure:
 * {
 *   roomId: {
 *     userId: WebSocket
 *   }
 * }
 */
const rooms = {};

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

  console.log("🟢 New WebSocket connection established");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!data.type) return;

      switch (data.type) {
        case "join":
          currentRoom = data.roomId;
          currentUserId = data.userId;
          if (!rooms[currentRoom]) rooms[currentRoom] = {};

          // Clean up any dead sockets before adding
          for (const [uid, client] of Object.entries(rooms[currentRoom])) {
            if (client.readyState !== client.OPEN) delete rooms[currentRoom][uid];
          }

          rooms[currentRoom][currentUserId] = ws;
          console.log(`👤 ${currentUserId} joined room ${currentRoom}`);
          console.log(`📦 Room ${currentRoom} now has ${Object.keys(rooms[currentRoom]).length} user(s)`);

          // Notify others someone joined
          broadcast(currentRoom, { type: "user-joined", userId: currentUserId }, currentUserId);

          // If exactly 2 users, notify both to start
          if (Object.keys(rooms[currentRoom]).length === 2) {
            const [caller, callee] = Object.keys(rooms[currentRoom]);
            console.log(`📞 Starting call between ${caller} (caller) and ${callee} (callee)`);
            rooms[currentRoom][caller].send(JSON.stringify({ type: "ready", role: "caller" }));
            rooms[currentRoom][callee].send(JSON.stringify({ type: "ready", role: "callee" }));
          }
          break;

        case "offer":
        case "answer":
        case "ice":
          if (currentRoom && currentUserId) {
            broadcast(currentRoom, { ...data, from: currentUserId }, currentUserId);
          }
          break;

        default:
          console.log("⚠️ Unknown message type:", data.type);
      }
    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });

  ws.on("close", () => {
    if (currentRoom && currentUserId && rooms[currentRoom]) {
      delete rooms[currentRoom][currentUserId];
      console.log(`❌ ${currentUserId} left room ${currentRoom}`);

      broadcast(currentRoom, { type: "user-left", userId: currentUserId });

      if (Object.keys(rooms[currentRoom]).length === 0) {
        delete rooms[currentRoom];
        console.log(`🧹 Room ${currentRoom} deleted`);
      }
    }
  });

  ws.on("pong", () => (ws.isAlive = true)); // Keep connection alive
});

// Keep-alive interval for Render (to prevent idle timeout)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(port, () => console.log(`🚀 VoiceSignal signaling server running on port ${port}`));
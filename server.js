// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const port = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());

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

          console.log(`👤 ${currentUserId} joined ${currentRoom}`);

          // Send the list of existing users to the new user
          const existingUsers = Object.keys(rooms[currentRoom]).filter(
            (id) => id !== currentUserId
          );
          ws.send(
            JSON.stringify({
              type: "existing-users",
              users: existingUsers,
            })
          );

          // Notify everyone else
          broadcast(
            currentRoom,
            { type: "user-joined", userId: currentUserId },
            currentUserId
          );
          break;

        case "offer":
        case "answer":
        case "ice":
          if (currentRoom && currentUserId) {
            broadcast(currentRoom, { ...data, from: currentUserId }, currentUserId);
          }
          break;

        case "leave":
          if (currentRoom && currentUserId && rooms[currentRoom]) {
            delete rooms[currentRoom][currentUserId];
            broadcast(currentRoom, { type: "user-left", userId: currentUserId });
          }
          break;

        default:
          console.log("Unknown type:", data.type);
      }
    } catch (e) {
      console.error("Error:", e);
    }
  });

  ws.on("close", () => {
    if (currentRoom && currentUserId && rooms[currentRoom]) {
      delete rooms[currentRoom][currentUserId];
      broadcast(currentRoom, { type: "user-left", userId: currentUserId });
      if (Object.keys(rooms[currentRoom]).length === 0) delete rooms[currentRoom];
    }
  });
});

server.listen(port, () =>
  console.log(`🚀 VoiceSignal signaling server running on ${port}`)
);
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

// Store rooms and their participants
// Structure: { roomId: { userId: ws } }
const rooms = {};

// Store additional metadata for each connection
const connectionMetadata = new Map();

/**
 * Broadcast a message to all users in a room except the sender
 * @param {string} roomId - Room identifier
 * @param {Object} message - Message to broadcast
 * @param {string} excludeUserId - User ID to exclude (optional)
 */
function broadcast(roomId, message, excludeUserId = null) {
  if (!rooms[roomId]) return;
  
  for (const [userId, client] of Object.entries(rooms[roomId])) {
    // Check if client is still connected
    if (client.readyState === client.OPEN && userId !== excludeUserId) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to ${userId}:`, error);
      }
    }
  }
}

/**
 * Clean up resources when a user disconnects
 * @param {string} roomId - Room identifier
 * @param {string} userId - User identifier
 */
function cleanupUser(roomId, userId) {
  if (rooms[roomId] && rooms[roomId][userId]) {
    // Remove user from room
    delete rooms[roomId][userId];
    
    // Remove metadata
    connectionMetadata.delete(rooms[roomId][userId]);
    
    // Notify other users
    broadcast(roomId, { type: "user-left", userId: userId });
    
    // Clean up empty room
    if (Object.keys(rooms[roomId]).length === 0) {
      delete rooms[roomId];
      console.log(`🗑️ Room ${roomId} deleted (empty)`);
    }
    
    console.log(`👋 ${userId} left ${roomId}`);
  }
}

// Handle new WebSocket connections
wss.on("connection", (ws, req) => {
  console.log(`🔗 New WebSocket connection from ${req.socket.remoteAddress}`);
  
  // Set up heartbeat mechanism
  ws.isAlive = true;
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000); // Ping every 30 seconds
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Store connection metadata
  const connectionInfo = {
    ip: req.socket.remoteAddress,
    connectedAt: new Date(),
    lastActivity: new Date()
  };
  connectionMetadata.set(ws, connectionInfo);
  
  // Handle incoming messages
  ws.on("message", (msg) => {
    try {
      // Update last activity
      connectionInfo.lastActivity = new Date();
      
      const data = JSON.parse(msg);
      console.log(`📩 Message from ${connectionInfo.ip}:`, data.type);
      
      // Validate message structure
      if (!data.type) {
        ws.send(JSON.stringify({ 
          type: "error", 
          message: "Missing message type" 
        }));
        return;
      }
      
      switch (data.type) {
        case "join":
          // Validate join request
          if (!data.roomId || !data.userId) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Missing roomId or userId" 
            }));
            return;
          }
          
          const { roomId, userId } = data;
          
          // Store room and user info
          if (!rooms[roomId]) {
            rooms[roomId] = {};
            console.log(`🏠 Room ${roomId} created`);
          }
          
          rooms[roomId][userId] = ws;
          connectionInfo.roomId = roomId;
          connectionInfo.userId = userId;
          
          console.log(`👤 ${userId} joined ${roomId} (${Object.keys(rooms[roomId]).length} users)`);
          
          // Send the list of existing users to the new user
          const existingUsers = Object.keys(rooms[roomId]).filter(
            (id) => id !== userId
          );
          
          ws.send(
            JSON.stringify({
              type: "existing-users",
              users: existingUsers,
            })
          );
          
          // Notify everyone else about the new user
          broadcast(
            roomId,
            { type: "user-joined", userId: userId },
            userId
          );
          break;

        case "offer":
        case "answer":
        case "ice":
          // Validate signaling messages
          if (!connectionInfo.roomId || !connectionInfo.userId) {
            ws.send(JSON.stringify({ 
              type: "error", 
              message: "Not joined to a room" 
            }));
            return;
          }
          
          // Forward signaling messages to other participants
          broadcast(
            connectionInfo.roomId, 
            { ...data, from: connectionInfo.userId }, 
            connectionInfo.userId
          );
          break;

        case "leave":
          if (connectionInfo.roomId && connectionInfo.userId) {
            cleanupUser(connectionInfo.roomId, connectionInfo.userId);
          }
          break;

        default:
          console.log("Unknown message type:", data.type);
          ws.send(JSON.stringify({ 
            type: "error", 
            message: `Unknown message type: ${data.type}` 
          }));
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(JSON.stringify({ 
        type: "error", 
        message: "Invalid message format" 
      }));
    }
  });

  // Handle WebSocket errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Handle WebSocket closure
  ws.on("close", (code, reason) => {
    console.log(`🔒 WebSocket closed for ${connectionInfo?.ip || 'unknown'} (code: ${code})`);
    
    // Clean up heartbeat interval
    clearInterval(heartbeatInterval);
    
    // Clean up user if they were in a room
    if (connectionInfo?.roomId && connectionInfo?.userId) {
      cleanupUser(connectionInfo.roomId, connectionInfo.userId);
    }
    
    // Remove metadata
    connectionMetadata.delete(ws);
  });
});

// Implement heartbeat check for dead connections
const heartbeatCheckInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    
    ws.isAlive = false;
    // The pong event will set this back to true
  });
}, 30000);

// Clean up heartbeat check on server shutdown
server.on('close', () => {
  clearInterval(heartbeatCheckInterval);
});

server.listen(port, () => {
  console.log(`🚀 VoiceSignal signaling server running on port ${port}`);
  console.log(`📡 WebSocket server ready for WebRTC signaling`);
});
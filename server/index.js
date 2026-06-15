import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
// Fixed TTL (not sliding) — a room is hard-expired this many minutes after creation.
const ROOM_EXPIRY_MINUTES = Number(process.env.ROOM_EXPIRY_MINUTES || 25);
const ROOM_EXPIRY_MS = ROOM_EXPIRY_MINUTES * 60 * 1000;

// ---------------------------------------------------------------------------
// App + Socket.io setup
// ---------------------------------------------------------------------------
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

// Simple health check for hosting platforms (Render/Railway).
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------
// roomId -> { roomId, creatorSocketId, receiverSocketId, createdAt }
// The server only tracks WHO is in a room so it can relay signals between the
// two peers. It never sees, stores, or processes any file bytes.
const rooms = new Map();

// Periodically purge rooms that have outlived their fixed TTL.
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_EXPIRY_MS) {
      rooms.delete(roomId);
    }
  }
}, 60 * 1000); // sweep every minute

// Returns true if the room exists AND has not passed its TTL.
function isRoomValid(room) {
  if (!room) return false;
  return Date.now() - room.createdAt <= ROOM_EXPIRY_MS;
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  // -- Create Room ----------------------------------------------------------
  // The sender requests a room. We mint a UUID, remember the creator, and
  // hand the roomId back so the sender can build a share link.
  socket.on("create-room", () => {
    // "Start new transfer" reuses the same (singleton) socket, so this socket
    // may still own a previous room. Close any prior rooms it created and tell
    // any attached receiver, otherwise the stale room lingers and its leftover
    // WebRTC signals cross-talk into the new connection.
    for (const [existingId, existingRoom] of rooms.entries()) {
      if (existingRoom.creatorSocketId === socket.id) {
        if (existingRoom.receiverSocketId) {
          io.to(existingRoom.receiverSocketId).emit("peer-disconnected");
        }
        socket.leave(existingId);
        rooms.delete(existingId);
      }
    }

    const roomId = uuidv4();
    rooms.set(roomId, {
      roomId,
      creatorSocketId: socket.id,
      receiverSocketId: null,
      createdAt: Date.now(),
    });

    socket.join(roomId);
    socket.emit("room-created", { roomId });
  });

  // -- Join Room ------------------------------------------------------------
  // The receiver opens the share link and tries to join. Reject if the room
  // is missing or expired so the UI can show "Room not found or expired".
  socket.on("join-room", (roomId) => {
    const room = rooms.get(roomId);

    if (!isRoomValid(room)) {
      // Clean up a stale entry if it exists but is expired.
      if (room) rooms.delete(roomId);
      socket.emit("room-error", { message: "Room not found or expired" });
      return;
    }

    room.receiverSocketId = socket.id;
    socket.join(roomId);

    // Tell the receiver it's in...
    socket.emit("room-joined", { roomId });
    // ...and tell the sender a peer arrived so it can start the WebRTC offer.
    io.to(room.creatorSocketId).emit("peer-joined", { roomId });
  });

  // -- Signal Relay ---------------------------------------------------------
  // Forward SDP/ICE payloads to the OTHER peer in the room. The server treats
  // this blob as opaque — it never inspects or stores file data.
  socket.on("signal", ({ roomId, signal }) => {
    const room = rooms.get(roomId);
    if (!isRoomValid(room)) return;

    // Determine the counterpart: if sender sent it, relay to receiver, etc.
    const targetId =
      socket.id === room.creatorSocketId
        ? room.receiverSocketId
        : room.creatorSocketId;

    if (targetId) {
      // Tag with roomId so the receiving peer can reject signals that belong
      // to a different/stale room (prevents cross-talk after a new transfer).
      io.to(targetId).emit("signal", { roomId, signal });
    }
  });

  // -- Resume Request -------------------------------------------------------
  // The receiver's WebRTC data channel dropped but the signaling socket is
  // still alive (e.g. a transient ICE failure). It asks us to nudge the sender
  // so the sender re-creates its peer and emits a fresh offer, letting the
  // transfer resume from the last verified chunk. Purely a coordination
  // signal — no file data is involved.
  socket.on("resume-request", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!isRoomValid(room)) return;

    // Relay to the counterpart peer (normally receiver -> sender).
    const targetId =
      socket.id === room.creatorSocketId
        ? room.receiverSocketId
        : room.creatorSocketId;

    if (targetId) {
      io.to(targetId).emit("resume-request", { roomId });
    }
  });

  // -- Disconnect Handling --------------------------------------------------
  // When either peer drops, notify the remaining peer and tidy room state.
  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      const isCreator = room.creatorSocketId === socket.id;
      const isReceiver = room.receiverSocketId === socket.id;
      if (!isCreator && !isReceiver) continue;

      const remainingId = isCreator
        ? room.receiverSocketId
        : room.creatorSocketId;

      if (remainingId) {
        io.to(remainingId).emit("peer-disconnected");
      }

      // If the creator leaves, the room is dead. If only the receiver leaves,
      // keep the room open so a new receiver could still join before TTL.
      if (isCreator) {
        rooms.delete(roomId);
      } else if (isReceiver) {
        room.receiverSocketId = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`QuickShare signaling server listening on port ${PORT}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
  console.log(`Room TTL: ${ROOM_EXPIRY_MINUTES} minutes`);
});

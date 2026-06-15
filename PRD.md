# AI IDE Prompt — P2P Web Share

## PROJECT OVERVIEW

Build a full-stack **P2P browser-to-browser file sharing web app** called **"QuickShare"**.

Users drop a file → get a unique room link → recipient opens it → file transfers directly browser-to-browser via WebRTC.

The server never touches file data — it only coordinates the WebRTC handshake.

The application must support stable, secure, real-time browser-to-browser file transfer with progress tracking, integrity verification, graceful recovery, and a modern responsive UI.

---

# TECH STACK

| Layer              | Technology                     |
| ------------------ | ------------------------------ |
| Frontend           | React.js + Tailwind CSS (Vite) |
| Signaling Backend  | Node.js + Express + Socket.io  |
| P2P Layer          | WebRTC via `simple-peer`       |
| Hashing            | Web Crypto API (SHA-256)       |
| Hosting (Frontend) | Vercel / Netlify               |
| Hosting (Backend)  | Render / Railway               |

---

# FOLDER STRUCTURE

```txt
p2p-webshare/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DropZone.jsx
│   │   │   ├── ProgressBar.jsx
│   │   │   ├── ConnectionStatus.jsx
│   │   │   └── RoomLink.jsx
│   │   ├── hooks/
│   │   │   ├── usePeer.js
│   │   │   └── useFileTransfer.js
│   │   ├── pages/
│   │   │   ├── SenderPage.jsx
│   │   │   └── ReceiverPage.jsx
│   │   ├── utils/
│   │   │   └── crypto.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
│
├── server/
│   ├── index.js
│   └── package.json
│
└── README.md
```

---

# GLOBAL CONSTANTS

Use a shared chunk size constant throughout the application.

```js
const CHUNK_SIZE = 64 * 1024; // 64KB
```

---

# WEBRTC CONFIGURATION

All peer connections must use STUN servers.

```js
const peerConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
}
```

Pass this configuration into every `simple-peer` instance.

---

# BACKEND — server/index.js

Build a lightweight Socket.io signaling server.

## Responsibilities

### Create Room

On:

```js
create-room
```

* Generate a UUID roomId.
* Store room information in a Map.
* Save:

  * roomId
  * creator socket id
  * createdAt timestamp

Emit:

```js
room-created
```

with:

```js
{
  roomId
}
```

---

### Join Room

On:

```js
join-room
```

* Validate room exists.
* Reject expired rooms.
* Notify sender.

Emit:

```js
room-joined
peer-joined
```

appropriately.

---

### Room Expiration

Rooms should expire after:

```txt
25 minutes of inactivity
```

Expired rooms must be removed automatically.

Joining an expired room should return:

```txt
Room not found or expired
```

---

### Signal Relay

Relay WebRTC signals only.

```js
signal
```

must forward SDP and ICE messages between peers.

The server must never receive or process file bytes.

---

### Disconnect Handling

On disconnect:

```js
peer-disconnected
```

should be emitted to the remaining peer.

Clean room state when necessary.

---

### CORS

Allow frontend origin from environment variable.

---

# FRONTEND ROUTING

```txt
/              -> SenderPage
/room/:roomId  -> ReceiverPage
```

---

# SENDER PAGE

## File Upload

Provide a drag-and-drop upload area.

Requirements:

* Accept any file type.
* Reject files larger than 50MB.
* Display:

  * file name
  * file size
  * MIME type

Show inline validation errors.

---

## Room Creation

After file selection:

```js
socket.emit("create-room")
```

Display generated share link.

Example:

```txt
https://app.com/room/12345
```

Provide copy button.

---

## Wait For Receiver

Display:

```txt
Waiting for receiver...
```

until:

```js
peer-joined
```

fires.

---

## Peer Creation

Create `simple-peer` as initiator.

```js
new Peer({
  initiator: true,
  trickle: false,
  config: peerConfig
})
```

---

## Metadata Packet (IMPORTANT)

Before sending file chunks, send metadata.

```js
{
  type: "metadata",
  fileName,
  fileSize,
  mimeType,
  totalChunks
}
```

The receiver should use this data to prepare transfer state.

---

## File Reading

Preferred:

```js
const buffer = await file.arrayBuffer()
```

Fallback:

```js
FileReader
```

for compatibility if necessary.

---

## Hashing

Generate SHA-256 hash before transfer.

```js
const hash = await hashFile(buffer)
```

---

## Chunk Transfer

Split file using:

```js
CHUNK_SIZE = 64KB
```

Send sequential chunks.

---

## Backpressure Handling

Prevent WebRTC buffer overflow.

Before sending a chunk:

```js
peer._channel.bufferedAmount
```

must remain below a safe threshold.

Example:

```js
while (peer._channel.bufferedAmount > 1024 * 1024) {
  await wait(50)
}
```

This prevents crashes and stalled transfers on slower networks.

---

## Completion Message

After final chunk:

```js
{
  type: "done",
  hash,
  totalChunks,
  fileName,
  fileSize,
  mimeType
}
```

---

## Sender Progress UI

Display:

* percentage
* MB/s
* status

States:

```txt
Waiting
Connected
Transferring
Complete
Disconnected
```

---

## Sender Disconnect Handling

If receiver leaves:

```txt
Receiver disconnected
```

must be shown gracefully.

No crashes.

No freezes.

---

# RECEIVER PAGE

## Join Room

On mount:

```js
socket.emit("join-room", roomId)
```

---

## Peer Creation

Create peer as non-initiator.

```js
new Peer({
  initiator: false,
  trickle: false,
  config: peerConfig
})
```

---

## Receive Metadata

Handle:

```js
{
  type: "metadata"
}
```

Store:

* file name
* size
* MIME type
* total chunks

Display file information immediately.

---

## Receive Chunks

Store chunks in memory.

```js
receivedChunks.push(chunk)
```

Track received bytes.

Update progress in real time.

---

## Completion Verification

When:

```js
{
  type: "done"
}
```

arrives:

### Step 1

Verify chunk count.

```js
receivedChunks.length === totalChunks
```

If not:

```txt
Transfer incomplete
```

---

### Step 2

Rebuild Blob.

```js
new Blob(receivedChunks)
```

---

### Step 3

Compute SHA-256.

```js
const receivedHash = await hashBlob(blob)
```

---

### Step 4

Compare hashes.

If mismatch:

```txt
Transfer failed — file corrupted
```

Provide retry option.

---

### Step 5

Auto-download.

```js
URL.createObjectURL(blob)
```

Generate temporary link.

Trigger automatic download.

---

## Receiver Status UI

States:

```txt
Waiting
Connecting
Connected
Transferring
Complete
Disconnected
```

---

## Receiver Disconnect Handling

If sender disconnects before completion:

```txt
Sender disconnected
```

Display graceful message.

---

# utils/crypto.js

Export:

```js
hashFile(arrayBuffer)
hashBlob(blob)
```

Requirements:

* SHA-256
* Web Crypto API
* Return lowercase hexadecimal string

Example:

```js
const hash = await crypto.subtle.digest(
  "SHA-256",
  arrayBuffer
)
```

---

# hooks/usePeer.js

Responsibilities:

* Peer creation
* Signal forwarding
* Connection lifecycle
* Error handling
* Cleanup

Return:

```js
{
  peer,
  connected,
  error
}
```

Handle:

```txt
ICE failures
Signal failures
Disconnects
```

Gracefully.

---

# hooks/useFileTransfer.js

Responsibilities:

## Sender

* Metadata transmission
* File chunking
* Progress updates
* Speed calculation
* Completion notification

## Receiver

* Chunk buffering
* Reassembly
* Verification
* Auto-download

Return:

```js
{
  progress,
  speed,
  status,
  startTransfer,
  receivedFile
}
```

---

# UI DESIGN REQUIREMENTS

Follow Stripe-inspired modern design principles.

## Colors

```css
--color-primary:    #533AFD;
--color-secondary:  #0A2540;
--color-tertiary:   #B9B9F9;
--color-neutral:    #FFFFFF;
--color-surface:    #F6F9FC;
--color-on-surface: #0A2540;
--color-muted:      #5E6C84;
--color-border:     #E6EBF1;
--color-success:    #81B81A;
--color-error:      #E5484D;
```

## Typography

Use:

```txt
sohne-var
```

Fallback:

```txt
SF Pro Display, sans-serif
```

Maintain the exact hierarchy defined in the specification.

---

# COMPONENT REQUIREMENTS

## DropZone

* Dashed border
* Drag-over highlight
* Large upload area
* Inline validation messages

---

## ProgressBar

Display:

* percentage
* transfer speed

---

## ConnectionStatus

States:

```txt
Waiting
Connecting
Connected
Transferring
Complete
Disconnected
```

Use appropriate colors.

---

## RoomLink

* Read-only input
* Copy button
* Copied state feedback

---

# RESPONSIVENESS

Must work on:

* Desktop
* Tablet
* Mobile

No horizontal scrolling.

---

# ERROR HANDLING

## File Too Large

Show:

```txt
File exceeds 50MB limit
```

---

## Invalid Room

Show:

```txt
Room not found or expired
```

---

## Hash Mismatch

Show:

```txt
Transfer failed — file corrupted
```

Provide retry action.

---

## Peer Disconnect

Show appropriate notification.

Do not crash.

---

## ICE Failure

Convert technical errors into user-friendly messages.

Example:

```txt
Unable to establish peer connection.
Please check your network and try again.
```

---

# OPTIONAL ADVANCED FEATURES (BUILD THEM AFTER MVP WHEN I TELL YOU)

## Zero-Knowledge Encryption

Encrypt chunks using:

```txt
AES-GCM
```

via Web Crypto API.

Sender generates key.

Key is shared only via URL hash:

```txt
/room/abc123#key=XYZ
```

Server must never access the key.

---

## Resume Transfers

Store:

```txt
last verified chunk index
```

Resume from checkpoint after reconnect.

---

## Large File Support

Use:

* Streams API
* OPFS
* IndexedDB

for files larger than browser memory limits.

---

## Multi-Peer Swarming

Allow multiple peers to distribute chunks simultaneously.

---

# ENVIRONMENT VARIABLES

## client/.env

```env
VITE_SERVER_URL=http://localhost:3001
```

## server/.env

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
ROOM_EXPIRY_MINUTES=25
```

---

# README.md MUST INCLUDE

* Project description
* Architecture overview
* Local setup instructions
* Environment variable setup
* Deployment instructions
* WebRTC explanation
* File integrity verification explanation
* Screenshots section
* Live demo link placeholder
* Future improvements section

---

# CONSTRAINTS

* No Firebase Storage
* No Supabase Storage
* No AWS S3
* No Cloudinary
* No third-party file storage
* No file bytes through backend
* All chunking in browser
* All hashing in browser
* All verification in browser
* Use `simple-peer`
* Comment all non-obvious logic
* Maintain clean code organization
* Ensure graceful failure handling

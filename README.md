# QuickShare — P2P Web Share

Drop a file, share a link, and the file transfers **directly browser-to-browser** over WebRTC. The server only coordinates the handshake — it never sees, stores, or relays a single byte of your file.

---

## Features

- Drag-and-drop file sharing (any file type, multi-GB direct-to-disk transfers)
- Direct peer-to-peer transfer via WebRTC (`simple-peer`)
- SHA-256 integrity verification on both ends
- Real-time progress, transfer speed, and ETA
- Resume from the last verified chunk after a dropped data channel
- Backpressure handling to prevent stalls on slow networks
- Graceful handling of disconnects, expired rooms, and corrupted transfers
- Peer device labels exchanged over the data channel ("Chrome on Windows")
- Device-only transfer history (localStorage — never leaves the browser)
- Responsive design system: Hanken Grotesk / JetBrains Mono type, indigo +
  navy palette, Material Symbols icons, desktop nav + mobile bottom nav

---

## Architecture Overview

```
┌──────────────┐        signaling (SDP/ICE)        ┌──────────────┐
│   Sender     │  ───────────────────────────────▶ │  Signaling   │
│  (browser)   │ ◀───────────────────────────────  │  Server      │
└──────┬───────┘        (Socket.io relay)           │ (Node/Express)│
       │                                            └──────┬───────┘
       │                                                   │
       │           direct WebRTC data channel              │
       │   ════════════════════════════════════════▶      │
       ▼           (file chunks, never via server)         ▼
┌──────────────┐                                    ┌──────────────┐
│  Receiver    │                                    │  Receiver     │
│  (browser)   │                                    │  joins room   │
└──────────────┘                                    └──────────────┘
```

- **Frontend:** React + Tailwind CSS (Vite)
- **Signaling backend:** Node.js + Express + Socket.io
- **P2P layer:** WebRTC via `simple-peer`
- **Hashing:** Web Crypto API (SHA-256)

The server's only jobs are: create rooms, validate joins, relay opaque WebRTC signals, and notify peers on disconnect. **No file bytes ever pass through the backend.**

---

## Project Structure

```
p2p-webshare/
├── client/      # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── layout/   AppLayout, Header, BottomNav, Footer
│       │   └── ui/       Button, Card, StatusChip, ProgressBar, DropZone,
│       │                 FileRow, RoomCodeBox, Avatar, PageHeading
│       ├── hooks/        usePeer, useFileTransfer
│       ├── pages/        SenderPage, ReceiverPage, ReceiveJoinPage, HistoryPage
│       ├── utils/        crypto, fileSink, browser, fileMeta, format, history
│       └── constants.js  shared CHUNK_SIZE, peerConfig, limits
└── server/      # Socket.io signaling server
    └── index.js
```

### Routes

```
/              SenderPage    — pick a file, get a share link, send
/receive       ReceiveJoinPage — paste a share link / room code to join
/room/:roomId  ReceiverPage  — active receive (the share link target)
/history       HistoryPage   — device-only record of past transfers
```

---

## Local Setup

You'll need **Node.js 18+**.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # adjust if needed
npm run dev            # starts on http://localhost:3001
```

### 2. Frontend

```bash
cd client
npm install
cp .env.example .env   # adjust if needed
npm run dev            # starts on http://localhost:5173
```

Open `http://localhost:5173`, drop a file, copy the share link, and open it in another tab/device.

> **Local testing tip:** open the receiver link in a second browser tab, a different browser, or another device on the same network.

---

## Environment Variables

### `client/.env`

```env
VITE_SERVER_URL=http://localhost:3001
```

### `server/.env`

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
ROOM_EXPIRY_MINUTES=25
```

Rooms expire on a **fixed 25-minute TTL** from creation. Joining an expired room returns `Room not found or expired`.

---

## Deployment

### Frontend (Vercel / Netlify)

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_SERVER_URL` to your deployed backend URL.
- SPA routing for `/room/:roomId` is handled by `vercel.json` (Vercel) and `public/_redirects` (Netlify).

### Backend (Render / Railway)

- Root directory: `server`
- Start command: `npm start`
- Set `CLIENT_ORIGIN` to your deployed frontend URL and `PORT` as required by the platform.
- A `/health` endpoint is exposed for platform health checks.

---

## How WebRTC Works Here

1. The **sender** asks the server to create a room and gets a unique link.
2. The **receiver** opens the link and joins the room.
3. The server tells the sender a peer arrived (`peer-joined`).
4. The peers exchange WebRTC **offer/answer (SDP)** and **ICE candidates** through the Socket.io `signal` relay. With `trickle: false`, candidates are bundled into a single offer/answer each way.
5. A **STUN server** helps each peer discover its public address so a direct connection can form across NATs.
6. Once the **data channel** opens, the file flows directly between browsers — the server is no longer involved.

---

## File Integrity Verification

1. Before sending, the sender computes a **SHA-256 hash** of the entire file.
2. The file is split into **64KB chunks** and streamed over the data channel with backpressure control.
3. A final `done` message carries the hash and expected chunk count.
4. The receiver:
   - verifies the **chunk count** matches,
   - reassembles a **Blob**,
   - recomputes the **SHA-256 hash**,
   - and compares it to the sender's hash.
5. On match → the file auto-downloads. On mismatch → `Transfer failed — file corrupted` with a retry option.

This guarantees the downloaded file is bit-for-bit identical to the original.

---

## Screenshots

> _Add screenshots here._
>
> - Sender page with share link
> - Transfer in progress
> - Receiver completion + verification

---

## Live Demo

> _Live demo link placeholder — add your deployed URL here._

---

## Known Limitations

- **STUN-only (no TURN):** connections rely on STUN for NAT traversal. Peers behind symmetric NATs or strict corporate/mobile firewalls may fail to connect. Adding a TURN relay server would fix this (see future improvements).
- **50MB cap:** the whole file is held in memory on both ends for the MVP.
- **Single sender / single receiver** per room.
- **Resume is best-effort:** a transfer resumes from the last verified chunk when the WebRTC data channel drops while the signaling connection stays alive (e.g. a transient ICE/network blip). If the sender fully closes the tab or its signaling socket disconnects, the room is torn down and the transfer cannot resume.
- The sender accesses `simple-peer`'s private `_channel.bufferedAmount` for backpressure — fragile across library versions.

---

## Future Improvements

- **TURN server** support for reliable connectivity behind strict NATs.
- **Zero-knowledge encryption:** AES-GCM per-chunk encryption with the key shared only via the URL hash (`/room/abc123#key=XYZ`), never touching the server.
- **Resume across full disconnects:** persist the partial file + checkpoint (OPFS handle, chunk index, hash state) so a transfer can resume even after a page reload or the signaling socket dropping, not just a transient data-channel blip.
- **Large file support** via Streams API / OPFS / IndexedDB to exceed browser memory limits.
- **Multi-peer swarming** to distribute chunks across several receivers.
```

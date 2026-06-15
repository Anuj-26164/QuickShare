import { io } from "socket.io-client";
import { SERVER_URL } from "./constants.js";

// Single shared socket for the whole app.
//
// Why a singleton: React 18 StrictMode mounts effects twice in dev (setup ->
// cleanup -> setup). If each mount created and disconnected its own socket, the
// first WebSocket would be torn down mid-handshake ("closed before connection
// established") and rooms would churn on the server. Reusing one connection
// avoids that entirely.
let socket;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

// Run `fn` as soon as the socket is connected (immediately if already up).
export function whenConnected(s, fn) {
  if (s.connected) {
    fn();
  } else {
    s.once("connect", fn);
  }
}

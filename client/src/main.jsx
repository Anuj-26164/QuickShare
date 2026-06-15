import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// NOTE: React.StrictMode is intentionally NOT used here.
// StrictMode double-invokes effects in dev (mount -> unmount -> mount), which
// breaks WebRTC: the one-shot `trickle: false` offer/answer handshake gets torn
// down and recreated, leaving one peer paired with a destroyed instance. That
// caused the receiver to connect while the sender never did. A single mount
// keeps the peer lifecycle correct.
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

import { Routes, Route, Navigate, useParams } from "react-router-dom";
import SenderPage from "./pages/SenderPage.jsx";
import ReceiverPage from "./pages/ReceiverPage.jsx";
import ReceiveJoinPage from "./pages/ReceiveJoinPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";

// Keying the receiver by roomId forces a full remount when the room changes
// (e.g. opening a "start new transfer" link in the same tab). Without this,
// React reuses the mounted component and stale connection/transfer state from
// the previous room leaks into the new one.
function ReceiverRoute() {
  const { roomId } = useParams();
  return <ReceiverPage key={roomId} />;
}

// Routing:
//   /              -> SenderPage (home / send flow)
//   /receive       -> ReceiveJoinPage (enter a room code/link)
//   /room/:roomId  -> ReceiverPage (active receive)
//   /history       -> HistoryPage
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SenderPage />} />
      <Route path="/send" element={<Navigate to="/" replace />} />
      <Route path="/receive" element={<ReceiveJoinPage />} />
      <Route path="/room/:roomId" element={<ReceiverRoute />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.jsx";
import Card from "../components/ui/Card.jsx";
import PageHeading from "../components/ui/PageHeading.jsx";
import Button from "../components/ui/Button.jsx";

// Extract a room id from a pasted share link or a bare id/code.
function parseRoomId(value) {
  const v = value.trim();
  if (!v) return "";
  const match = v.match(/\/room\/([^/?#]+)/i);
  return match ? match[1] : v;
}

// "Receive a File" — paste a share link or room code to join a sender's room.
export default function ReceiveJoinPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  const join = (e) => {
    e.preventDefault();
    const id = parseRoomId(value);
    if (id) navigate(`/room/${id}`);
  };

  return (
    <AppLayout>
      <div className="flex w-full max-w-[600px] flex-col gap-stack-lg">
        <PageHeading
          title="Receive a File"
          subtitle="Paste the share link the sender gave you to connect directly."
        />

        <Card>
          <form onSubmit={join} className="flex flex-col gap-stack-md">
            <div className="flex flex-col gap-stack-xs">
              <label className="ml-1 font-label-sm text-label-sm text-on-surface-variant">
                Share link or room code
              </label>
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="quickshare.app/room/… or a room code"
                className="w-full rounded border border-border bg-surface-container-lowest px-4 py-3 font-label-md text-label-md text-on-surface shadow-sm outline-none transition-colors focus:border-primary-container focus:ring-1 focus:ring-primary-container"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" icon="arrow_forward" disabled={!value.trim()}>
                Connect
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex items-center justify-center gap-2 font-label-sm text-label-sm text-muted">
          <span className="material-symbols-outlined text-[16px]">lock</span>
          Your file transfers directly from the sender — never through a server.
        </div>
      </div>
    </AppLayout>
  );
}

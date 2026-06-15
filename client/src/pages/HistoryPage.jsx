import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.jsx";
import Card from "../components/ui/Card.jsx";
import PageHeading from "../components/ui/PageHeading.jsx";
import StatusChip from "../components/ui/StatusChip.jsx";
import Button from "../components/ui/Button.jsx";
import { formatBytes } from "../utils/format.js";
import { fileIcon, fileTypeLabel } from "../utils/fileMeta.js";
import {
  getHistory,
  onHistoryChange,
  clearHistory,
  formatHistoryDate,
} from "../utils/history.js";

const DIRECTION_ICON = { sent: "north_east", received: "south_west" };

// "Transfer History" — a device-only record of past sends/receives, stored in
// localStorage (never leaves the browser).
export default function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getHistory());

  // Keep in sync with writes from transfers (same tab) and other tabs.
  useEffect(() => onHistoryChange(() => setItems(getHistory())), []);

  return (
    <AppLayout>
      <div className="flex w-full max-w-[700px] flex-col gap-stack-lg">
        <PageHeading
          title="Transfer History"
          subtitle="A record of files sent and received on this device."
        />

        {items.length === 0 ? (
          <Card className="text-center">
            <div className="flex flex-col items-center gap-stack-md p-stack-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/10">
                <span
                  className="material-symbols-outlined fill-icon text-primary-container"
                  style={{ fontSize: "32px" }}
                >
                  history
                </span>
              </div>
              <div className="flex flex-col gap-stack-xs">
                <span className="font-headline-md text-headline-md text-on-surface">
                  No transfers yet
                </span>
                <span className="font-body-md text-body-md text-muted">
                  Files you send or receive will show up here.
                </span>
              </div>
              <Button variant="primary" icon="upload_file" onClick={() => navigate("/")}>
                Send a file
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-stack-md p-stack-md">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-primary-container/10">
                      <span className="material-symbols-outlined fill-icon text-primary-container">
                        {fileIcon(item.name, item.mimeType)}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-grow flex-col">
                      <span className="truncate font-label-md text-label-md text-on-surface">
                        {item.name}
                      </span>
                      <span className="font-label-sm text-label-sm text-muted">
                        {formatBytes(item.size)} · {fileTypeLabel(item.name, item.mimeType)}
                      </span>
                    </div>

                    <div className="hidden shrink-0 flex-col items-end text-right sm:flex">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {item.direction === "sent" ? "To" : "From"} {item.peer}
                      </span>
                      <span className="font-label-sm text-label-sm text-muted">
                        {formatHistoryDate(item.date)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          item.direction === "sent" ? "text-primary-container" : "text-secondary"
                        }`}
                        title={item.direction === "sent" ? "Sent" : "Received"}
                      >
                        {DIRECTION_ICON[item.direction]}
                      </span>
                      <StatusChip
                        status={item.status === "complete" ? "complete" : "error"}
                        label={item.status === "complete" ? "Complete" : "Failed"}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="flex justify-end">
              <Button variant="ghost" icon="delete" onClick={clearHistory}>
                Clear history
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

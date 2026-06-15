import { useLocation, useNavigate } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import BottomNav from "./BottomNav.jsx";

// Map the current pathname to a highlighted nav key.
function activeFromPath(pathname) {
  if (pathname.startsWith("/room/") || pathname === "/receive") return "receive";
  if (pathname === "/history") return "history";
  return "send";
}

const ROUTE_FOR = {
  send: "/",
  receive: "/receive",
  history: "/history",
};

// Shared page shell: sticky header, centered main content area, desktop footer
// and mobile bottom nav. Navigation is wired to react-router here so the page
// components stay focused on transfer logic.
export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeFromPath(pathname);
  const onNavigate = (key) => navigate(ROUTE_FOR[key] ?? "/");

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body-md text-on-surface antialiased">
      <Header active={active} onNavigate={onNavigate} />

      <main className="mx-auto flex w-full max-w-container-max flex-grow flex-col items-center justify-center p-margin-mobile pb-32 md:p-margin-desktop md:pb-margin-desktop">
        {children}
      </main>

      <Footer />
      <BottomNav active={active} onNavigate={onNavigate} />
    </div>
  );
}

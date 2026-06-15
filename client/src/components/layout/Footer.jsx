const FOOTER_LINKS = [
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Support", href: "#" },
  { label: "GitHub", href: "https://github.com" },
];

// Desktop-only footer with brand line and link list.
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto hidden w-full border-t border-border bg-surface py-8 md:flex">
      <div className="mx-auto flex w-full max-w-container-max flex-col items-center justify-between gap-gutter px-margin-mobile md:flex-row md:px-margin-desktop">
        <span className="font-label-sm text-label-sm text-muted">
          © {year} QuickShare P2P · Secure &amp; effortless. The server never sees your files.
        </span>
        <div className="flex items-center gap-6">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-label-sm text-label-sm text-muted transition-all hover:text-primary hover:underline"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

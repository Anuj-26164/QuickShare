import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;
const distPath = join(__dirname, "dist");

// Serve static files from the Vite build output
app.use(express.static(distPath));

// SPA fallback — all routes serve index.html
app.get("*", (_req, res) => {
  res.sendFile(join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`QuickShare client served on port ${PORT}`);
});

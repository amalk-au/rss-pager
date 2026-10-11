// Optional local preview server. GitHub Pages serves these files itself.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = 4173;
// Serve only public application files, never local configuration or credentials.
const PUBLIC_FILES = {
  "index.html": "text/html",
  "styles.css": "text/css",
  "pager.js": "text/javascript",
  "feed.js": "text/javascript",
  "transport.js": "text/javascript",
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const filename = pathname.endsWith("/")
    ? "index.html"
    : pathname.split("/").pop();
  if (!PUBLIC_FILES[filename]) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const content = await readFile(new URL("../" + filename, import.meta.url));
    response.writeHead(200, {
      "Content-Type": PUBLIC_FILES[filename] + "; charset=utf-8",
      "Cache-Control": "no-store", // Editing a file should be visible on the next reload.
    });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end("Unable to read file");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`RSS Pager: http://localhost:${PORT}`);
});

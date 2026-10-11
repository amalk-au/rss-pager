// Optional local preview server.
// GitHub Pages serves these files itself.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = 4173;

// Explicitly allow only public application files.
// Never expose local configuration files or credentials.
const PUBLIC_FILES = {
  "/": {
    path: "../index.html",
    type: "text/html",
  },
  "/index.html": {
    path: "../index.html",
    type: "text/html",
  },
  "/styles.css": {
    path: "../styles.css",
    type: "text/css",
  },
  "/scripts/pager.js": {
    path: "./pager.js",
    type: "text/javascript",
  },
  "/scripts/feed.js": {
    path: "./feed.js",
    type: "text/javascript",
  },
  "/scripts/transport.js": {
    path: "./transport.js",
    type: "text/javascript",
  },
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;

  const file = PUBLIC_FILES[pathname];

  if (!file) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    response.end("Not found");
    return;
  }

  try {
    const content = await readFile(
      new URL(file.path, import.meta.url)
    );

    response.writeHead(200, {
      "Content-Type": `${file.type}; charset=utf-8`,
      "Cache-Control": "no-store",
    });

    response.end(content);
  } catch (error) {
    console.error(`Failed to serve ${pathname}:`, error);

    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    response.end("Unable to read file");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`RSS Pager: http://localhost:${PORT}`);
});
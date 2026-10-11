// Feed parsing and display helpers. No network requests are made in this module.
const MAX_FEED_BYTES = 3 * 1024 * 1024;
// Edit these presets to change the quick-connect buttons in Settings.
const EXAMPLES = [
  {
    name: "BBC News",
    short: "BBC",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
  },
  { name: "Hacker News", short: "Y", url: "https://hnrss.org/frontpage" },
  {
    name: "The Register",
    short: "R",
    url: "https://www.theregister.com/?lab_viewport=rss",
  },
];
// Shown only until the reader receives a real feed.
const DEMO_MESSAGES = [
  {
    id: "demo-welcome",
    feedId: "demo",
    feedName: "RSS Pager demo",
    title: "Small screen. Big world.",
    body: "Welcome to your quieter corner of the internet.\n\nConnect an RSS feed to receive the stories you care about, one message at a time.\n\nUse the arrow buttons to explore. The next good signal is yours to find.",
    url: "",
    publishedAt: "",
    receivedAt: "",
    unread: false,
    demo: true,
  },
  {
    id: "demo-controls",
    feedId: "demo",
    feedName: "RSS Pager demo",
    title: "A familiar feeling. A fresh signal.",
    body: "Built for your everyday reading.\n\nLeft and right switch messages. Up and down scroll through a story. You can also use your keyboard or scroll over the screen.\n\nPress the round read button to keep reading.",
    url: "",
    publishedAt: "",
    receivedAt: "",
    unread: true,
    demo: true,
  },
  {
    id: "demo-feeds",
    feedId: "demo",
    feedName: "RSS Pager demo",
    title: "Your news, on your terms.",
    body: "Newsrooms, personal blogs, space updates, and everything in between. If it has an RSS or Atom feed, your RSS Pager can tune in.\n\nOpen Settings and try a channel, or paste your own feed URL. Your feeds and messages are saved in this browser.\n\nNo account. No algorithm. Just a little more signal.",
    url: "",
    publishedAt: "",
    receivedAt: "",
    unread: true,
    demo: true,
  },
];
// Only allow HTTP(S) article links; reject executable URLs from publisher data.
function safeUrl(value, base) {
  try {
    if (!value?.trim()) return "";
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}
// Stable identifiers let refreshes recognize existing feeds and messages.
function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(36);
}
// Parse markup in a detached document and return plain text for the LCD.
function readableText(value) {
  const marked = value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(?:p|div|li|h[1-6]|blockquote|pre)\s*>/gi, "\n\n");
  const html = new DOMParser().parseFromString(marked, "text/html");
  html
    .querySelectorAll("script,style,noscript,iframe,object")
    .forEach((node) => node.remove());
  return (html.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function directChild(element, name) {
  return Array.from(element.children).find(
    (child) => child.localName.toLowerCase() === name,
  );
}
function descendant(element, name) {
  return Array.from(element.getElementsByTagName("*")).find(
    (child) => child.localName.toLowerCase() === name,
  );
}
// Normalize RSS, Atom, and RDF entries into the same feed/message data shape.
// Import at most 50 entries; use publisher IDs so refreshes can preserve read state.
function parseFeed(xml, url) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error(
      "This URL did not return a readable RSS or Atom feed. Check the feed address and try again.",
    );
  const root = document.documentElement;
  const channel = descendant(root, "channel") || root;
  const isFeed = ["rss", "feed", "rdf"].includes(root.localName.toLowerCase());
  if (!isFeed)
    throw new Error(
      "This looks like a webpage. Paste its RSS or Atom feed URL to connect.",
    );
  const feedId = `feed-${hash(url)}`;
  const name = readableText(
    directChild(channel, "title")?.textContent || new URL(url).hostname,
  );
  const now = new Date().toISOString();
  const entries = Array.from(root.getElementsByTagName("*"))
    .filter((node) => ["item", "entry"].includes(node.localName.toLowerCase()))
    .slice(0, 50);
  const messages = entries.map((entry, index) => {
    const title = readableText(
      directChild(entry, "title")?.textContent || "Untitled message",
    );
    const content =
      directChild(entry, "encoded") ||
      directChild(entry, "content") ||
      directChild(entry, "description") ||
      directChild(entry, "summary");
    const contentText = content?.children.length
      ? content.innerHTML
      : content?.textContent || "";
    const body =
      readableText(contentText).slice(0, 14000) ||
      "This feed contains a headline only. Open the original story to read more.";
    const links = Array.from(entry.children).filter(
      (child) => child.localName.toLowerCase() === "link",
    );
    const link =
      links.find(
        (node) =>
          !node.getAttribute("rel") || node.getAttribute("rel") === "alternate",
      ) || links[0];
    const storyUrl = safeUrl(
      link?.getAttribute("href") || link?.textContent?.trim() || "",
      url,
    );
    const published =
      directChild(entry, "pubdate")?.textContent ||
      directChild(entry, "published")?.textContent ||
      directChild(entry, "updated")?.textContent ||
      directChild(entry, "date")?.textContent ||
      "";
    const date = new Date(published);
    const identity =
      directChild(entry, "guid")?.textContent ||
      directChild(entry, "id")?.textContent ||
      storyUrl ||
      `${title}-${published}-${index}`;
    return {
      id: `${feedId}-${hash(identity)}`,
      feedId,
      feedName: name,
      title,
      body,
      url: storyUrl,
      publishedAt: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
      receivedAt: now,
      unread: true,
    };
  });
  return { feed: { id: feedId, url, name, updatedAt: now }, messages };
}
// Word-wrap paragraphs, splitting long words only when necessary, then paginate.
function wrapMessage(text, columns, rows) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      if (word.length > columns) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let start = 0; start < word.length; start += columns) {
          const chunk = word.slice(start, start + columns);
          if (chunk.length === columns) lines.push(chunk);
          else current = chunk;
        }
      } else if (current.length + word.length + (current ? 1 : 0) > columns) {
        lines.push(current);
        current = word;
      } else current += (current ? " " : "") + word;
    }
    if (current) lines.push(current);
  }
  const pages = [];
  while (lines.length) pages.push(lines.splice(0, rows).join("\n"));
  return pages.length ? pages : [""];
}
function relativeTime(value, demo) {
  if (demo || !value) return "Demo message";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
// Generate a short two-tone alert without downloading an audio asset.
function chirp() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, context.currentTime);
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1760, context.currentTime);
    oscillator.connect(gain);
    [0, 0.14].forEach((offset) => {
      gain.gain.setValueAtTime(0, context.currentTime + offset);
      gain.gain.linearRampToValueAtTime(
        0.055,
        context.currentTime + offset + 0.008,
      );
      gain.gain.setValueAtTime(0.055, context.currentTime + offset + 0.07);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + offset + 0.1);
    });
    oscillator.start();
    oscillator.stop(context.currentTime + 0.27);
    oscillator.onended = () => {
      void context.close();
    };
    void context.resume();
  } catch {
    /* Sound is optional when browser audio is unavailable. */
  }
}
function isPublicIPv4(host) {
  const parts = host.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}
function isPublicIPv6(host) {
  const address = host.slice(1, -1);
  // Native global-unicast addresses only. This also excludes loopback,
  // unique-local, link-local, multicast, and IPv4-mapped addresses.
  if (address.includes(".") || address.includes("%")) return false;
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  )
    return false;
  const words = [...left, ...Array(missing).fill("0"), ...right].map((word) =>
    parseInt(word, 16),
  );
  if (
    words.length !== 8 ||
    words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)
  )
    return false;
  if ((words[0] & 0xe000) !== 0x2000) return false;
  // Documentation, transition tunnels, and protocol-assignment space.
  if (words[0] === 0x2002) return false;
  if (words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
    return false;
  if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return false;
  return true;
}
// Reject credentials and obvious local/private destinations before any request.
// This is input validation, not DNS resolution or a server-side firewall.
function publicFeedUrl(value) {
  let url;
  try {
    if (!value || value.length > 8192) throw new Error();
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public RSS or Atom feed URL.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Use a public HTTP or HTTPS feed URL without a username or password.",
    );
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  const localName =
    !host ||
    host === "localhost" ||
    !host.includes(".") ||
    [".localhost", ".local", ".internal", ".home", ".lan"].some((suffix) =>
      host.endsWith(suffix),
    );
  const publicHost = host.startsWith("[")
    ? isPublicIPv6(host)
    : /^\d+(?:\.\d+){3}$/.test(host)
      ? isPublicIPv4(host)
      : !localName;
  if (!publicHost) {
    throw new Error("This address is not a public feed URL.");
  }
  url.hash = "";
  return url;
}
async function discardBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    /* The upstream may have already closed. */
  }
}
// Enforce the byte cap while streaming, even when Content-Length is absent.
async function readBoundedBody(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    await discardBody(response);
    throw new Error("This feed is too large. Choose a feed under 3 MB.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The publisher returned an empty feed.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FEED_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* The upstream may have already closed. */
        }
        throw new Error("This feed is too large. Choose a feed under 3 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
// Respect BOMs, HTTP charset, and XML encoding declarations from publishers.
function decodeXml(bytes, contentType) {
  let encoding = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  else if (!encoding) {
    const prolog = new TextDecoder().decode(bytes.subarray(0, 256));
    encoding = prolog.match(
      /^\s*<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i,
    )?.[1];
  }
  try {
    return new TextDecoder(encoding || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
// Lightweight transport check; parseFeed performs the full XML parse in the browser.
function looksLikeFeed(xml) {
  let content = xml.replace(/^\uFEFF/, "").trimStart();
  // Skip XML preamble, comments, and a DOCTYPE without interpreting entities.
  for (let count = 0; count < 24; count++) {
    if (content.startsWith("<?")) {
      const end = content.indexOf("?>");
      if (end < 0) return false;
      content = content.slice(end + 2).trimStart();
    } else if (content.startsWith("<!--")) {
      const end = content.indexOf("-->");
      if (end < 0) return false;
      content = content.slice(end + 3).trimStart();
    } else if (/^<!DOCTYPE\s/i.test(content)) {
      let bracketDepth = 0;
      let quote = "";
      let end = -1;
      for (let index = 9; index < content.length; index++) {
        const char = content[index];
        if (quote) {
          if (char === quote) quote = "";
        } else if (char === '"' || char === "'") quote = char;
        else if (char === "[") bracketDepth++;
        else if (char === "]") bracketDepth--;
        else if (char === ">" && bracketDepth === 0) {
          end = index;
          break;
        }
      }
      if (end < 0) return false;
      content = content.slice(end + 1).trimStart();
    } else break;
  }
  const root = content.match(
    /^<((?:[A-Za-z_][\w.-]*:)?(rss|feed|RDF))(?=[\s/>])/i,
  );
  if (!root) return false;
  const openingEnd = content.indexOf(">");
  if (openingEnd < 0) return false;
  const name = root[1];
  if (
    !content.slice(0, openingEnd).endsWith("/") &&
    !content.includes(`</${name}>`)
  )
    return false;
  if (root[2].toLowerCase() === "rss" || root[2].toLowerCase() === "rdf") {
    return /<(?:[A-Za-z_][\w.-]*:)?channel(?=[\s/>])/i.test(content);
  }
  return true;
}
export {
  EXAMPLES,
  DEMO_MESSAGES,
  safeUrl,
  parseFeed,
  wrapMessage,
  relativeTime,
  chirp,
  publicFeedUrl,
  readBoundedBody,
  decodeXml,
  looksLikeFeed,
};

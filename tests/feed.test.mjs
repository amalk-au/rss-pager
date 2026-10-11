import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicFeedUrl,
  readBoundedBody,
  decodeXml,
  looksLikeFeed,
  wrapMessage,
  safeUrl,
} from "../feed.js";
import { fetchFeedXml, validateRelay } from "../transport.js";
const RSS = "<rss><channel><title>News</title></channel></rss>";
test("validates public URLs and strips fragments", () => {
  assert.equal(
    publicFeedUrl("https://example.com/rss#x").href,
    "https://example.com/rss",
  );
  for (const url of [
    "",
    "ftp://example.com",
    "https://u:p@example.com",
    "http://localhost",
    "http://127.1",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://[::1]",
    "http://[fc00::1]",
    "http://host.internal",
  ])
    assert.throws(() => publicFeedUrl(url));
});
test("rejects unsafe article protocols", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(
    safeUrl("/story", "https://example.com/rss"),
    "https://example.com/story",
  );
});
test("recognizes RSS, Atom and RDF and rejects HTML and incomplete XML", () => {
  for (const xml of [
    RSS,
    "<feed/>",
    '<rdf:RDF xmlns:rdf="x"><channel/></rdf:RDF>',
    '<?xml version="1.0"?><!--x-->' + RSS,
  ])
    assert.ok(looksLikeFeed(xml));
  for (const xml of ["", "<html/>", "<rss><channel>", "<rss></rss>"])
    assert.equal(looksLikeFeed(xml), false);
});
test("preserves all long-word characters within page dimensions", () => {
  const text = "a".repeat(119);
  const pages = wrapMessage(text, 20, 4);
  assert.equal(pages.join("").replaceAll("\n", ""), text);
  assert.ok(
    pages.every(
      (p) =>
        p.split("\n").length <= 4 && p.split("\n").every((l) => l.length <= 20),
    ),
  );
});
test("decodes XML declaration encodings", () => {
  const xml = '<?xml version="1.0" encoding="iso-8859-1"?><feed>Café</feed>';
  assert.equal(
    decodeXml(
      Uint8Array.from(xml, (c) => c.charCodeAt(0)),
      "",
    ),
    xml,
  );
});
test("enforces advertised and streamed body limits", async () => {
  await assert.rejects(
    readBoundedBody(
      new Response("x", { headers: { "content-length": 4000000 } }),
    ),
    /large/,
  );
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(3200000));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBoundedBody(new Response(stream)), /large/);
  assert.ok(cancelled);
});
test("direct success avoids relay and omits credentials", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (url, opts) => {
    assert.equal(url, "https://example.com/feed");
    assert.equal(opts.credentials, "omit");
    return new Response(RSS);
  });
  assert.equal(await fetchFeedXml("https://example.com/feed"), RSS);
  assert.equal(mock.mock.callCount(), 1);
});
test("falls back to encoded relay on blocked direct access", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    if (calls.length === 1) throw new TypeError("Failed to fetch");
    return new Response(RSS);
  });
  assert.equal(
    await fetchFeedXml(
      "https://example.com/feed?a=1&b=2",
      "https://relay.example/raw?url={url}",
    ),
    RSS,
  );
  assert.equal(
    calls[1],
    "https://relay.example/raw?url=https%3A%2F%2Fexample.com%2Ffeed%3Fa%3D1%26b%3D2",
  );
});
test("direct-only reports failures without a relay request", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(fetchFeedXml("https://example.com", ""), /relay/);
  assert.equal(mock.mock.callCount(), 1);
});
test("validates relay before making requests", () => {
  assert.equal(validateRelay(""), "");
  assert.throws(() => validateRelay("http://example.com/{url}"), /HTTPS/);
  assert.throws(() => validateRelay("https://example.com"), /include/);
});
test("invalid feed data is never accepted", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Not a feed</html>"),
  );
  await assert.rejects(fetchFeedXml("https://example.com", ""), /invalid feed/);
});
test("times out slow requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      ),
  );
  const promise = fetchFeedXml("https://example.com", "");
  t.mock.timers.tick(15000);
  await assert.rejects(promise, /too long/);
});

test("a stalled direct request cannot delay a working relay until timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let directSignal;
  t.mock.method(globalThis, "fetch", (url, { signal }) => {
    if (url === "https://example.com/feed") {
      directSignal = signal;
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      );
    }
    return Promise.resolve(new Response(RSS));
  });
  const pending = fetchFeedXml("https://example.com/feed");
  t.mock.timers.tick(1200);
  assert.equal(await pending, RSS);
  assert.ok(directSignal.aborted);
});
test("a failed relay does not discard a later direct success", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let completeDirect;
  t.mock.method(globalThis, "fetch", (url) =>
    url === "https://example.com/feed"
      ? new Promise((resolve) => {
          completeDirect = resolve;
        })
      : Promise.reject(new TypeError("Relay unavailable")),
  );
  const pending = fetchFeedXml("https://example.com/feed");
  t.mock.timers.tick(1200);
  await Promise.resolve();
  completeDirect(new Response(RSS));
  assert.equal(await pending, RSS);
});
test("one deadline aborts both stalled requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const signals = [];
  t.mock.method(globalThis, "fetch", (_url, { signal }) => {
    signals.push(signal);
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    );
  });
  const pending = fetchFeedXml("https://example.com/feed");
  t.mock.timers.tick(1200);
  t.mock.timers.tick(13800);
  await assert.rejects(pending, /too long/);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((s) => s.aborted));
});
test("migrates the old default but preserves custom and disabled relays", async () => {
  const { migrateRelay, DEFAULT_RELAY } = await import("../transport.js");
  assert.equal(
    migrateRelay("https://api.allorigins.win/raw?url={url}"),
    DEFAULT_RELAY,
  );
  assert.equal(migrateRelay(""), "");
  assert.equal(
    migrateRelay("https://relay.example/?url={url}"),
    "https://relay.example/?url={url}",
  );
});
test("The Register replaces NASA in the default presets", async () => {
  const { EXAMPLES } = await import("../feed.js");
  assert.ok(
    EXAMPLES.some(
      (e) =>
        e.name === "The Register" &&
        e.url === "https://www.theregister.com/?lab_viewport=rss",
    ),
  );
  assert.ok(!EXAMPLES.some((e) => e.name === "NASA"));
});

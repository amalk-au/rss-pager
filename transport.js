import {
  publicFeedUrl,
  readBoundedBody,
  decodeXml,
  looksLikeFeed,
} from "./feed.js";
export const DEFAULT_RELAY = "https://proxy.cors.dev/raw?url={url}";
const LEGACY_RELAY = "https://api.allorigins.win/raw?url={url}";
const REQUEST_TIMEOUT_MS = 15000;
const RELAY_DELAY_MS = 1200;
export function validateRelay(template) {
  if (!template) return "";
  if (!template.includes("{url}"))
    throw new Error("The relay template must include {url}.");
  const url = publicFeedUrl(
    template.replace("{url}", encodeURIComponent("https://example.com/feed")),
  );
  if (url.protocol !== "https:") throw new Error("Use an HTTPS relay.");
  return template;
}
// Upgrade the obsolete built-in default without overwriting custom or direct-only settings.
export function migrateRelay(template) {
  return template === LEGACY_RELAY ? DEFAULT_RELAY : validateRelay(template);
}
async function readFeed(target, signal) {
  const response = await fetch(target, { signal, credentials: "omit" });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Feed request failed (HTTP ${response.status}).`);
  }
  const bytes = await readBoundedBody(response);
  const xml = decodeXml(bytes, response.headers.get("content-type") || "");
  if (!looksLikeFeed(xml))
    throw new Error(
      "This address returned a webpage or invalid feed. Use an RSS or Atom URL.",
    );
  return xml;
}
export async function fetchFeedXml(value, relay = DEFAULT_RELAY) {
  const url = publicFeedUrl(value).href;
  validateRelay(relay);
  // Give direct access a head start, but never wait for its full timeout to try the relay.
  // A single deadline bounds the entire operation; the first valid XML response wins.
  return new Promise((resolve, reject) => {
    const controllers = [];
    const errors = [];
    let finished = false,
      relayStarted = false,
      relayTimer;
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "The feed and available relay took too long to respond. Check your connection or change the relay in Settings. Saved messages are still available.",
          ),
        ),
      REQUEST_TIMEOUT_MS,
    );
    function finish(error, xml) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(relayTimer);
      for (const controller of controllers) controller.abort();
      if (error) reject(error);
      else resolve(xml);
    }
    async function attempt(target, direct) {
      const controller = new AbortController();
      controllers.push(controller);
      try {
        finish(null, await readFeed(target, controller.signal));
      } catch (error) {
        if (finished) return;
        errors.push(error);
        if (direct && relay) startRelay();
        if (errors.length === (relay ? 2 : 1)) {
          const reason =
            errors.find((e) => e.name !== "TypeError") || errors.at(-1);
          finish(
            new Error(
              `${reason?.message || "Unable to load feed."} Check the feed URL or configure a working CORS relay in Settings.`,
            ),
          );
        }
      }
    }
    function startRelay() {
      if (finished || relayStarted) return;
      relayStarted = true;
      clearTimeout(relayTimer);
      void attempt(relay.replaceAll("{url}", encodeURIComponent(url)), false);
    }
    if (relay) relayTimer = setTimeout(startRelay, RELAY_DELAY_MS);
    void attempt(url, true);
  });
}

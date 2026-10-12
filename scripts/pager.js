import {
  EXAMPLES,
  DEMO_MESSAGES,
  safeUrl,
  parseFeed,
  wrapMessage,
  relativeTime,
  chirp,
  publicFeedUrl,
} from "./feed.js";
import {
  DEFAULT_RELAY,
  validateRelay,
  migrateRelay,
  fetchFeedXml,
} from "./transport.js";

// DOM IDs match index.html; publisher text is never inserted as live HTML.
const getElement = (id) => document.getElementById(id);
const STORAGE_KEY = "rss-pager-v1";

// Persist subscriptions, history, reading position, and preferences.
let state = {
  feeds: [],
  messages: structuredClone(DEMO_MESSAGES),
  selectedId: DEMO_MESSAGES[0].id,
  sound: false,
  autoRefresh: "5",
  relay: DEFAULT_RELAY,
};
// Read the legacy key too so existing users retain their saved messages.
try {
  const data = JSON.parse(
    localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("advisor-rss-v1") ||
      "null",
  );
  if (data && Array.isArray(data.feeds) && Array.isArray(data.messages)) {
    const feeds = data.feeds.filter(
      (feed) =>
        feed &&
        typeof feed.id === "string" &&
        typeof feed.name === "string" &&
        safeUrl(feed.url),
    );
    const messages = data.messages
      .filter(
        (message) =>
          message &&
          typeof message.id === "string" &&
          typeof message.title === "string" &&
          typeof message.body === "string" &&
          typeof message.feedName === "string" &&
          (message.demo || feeds.some((feed) => feed.id === message.feedId)),
      )
      .slice(0, 500)
      .map((message) =>
        message.demo
          ? {
              ...(DEMO_MESSAGES.find((d) => d.id === message.id) ||
                DEMO_MESSAGES[0]),
              unread: message.unread === true,
            }
          : {
              ...message,
              url: safeUrl(message.url),
              unread: message.unread === true,
            },
      );
    state = {
      ...state,
      feeds,
      messages,
      selectedId: typeof data.selectedId === "string" ? data.selectedId : "",
      sound: data.sound === true,
      autoRefresh: ["off", "1", "5", "15"].includes(data.autoRefresh)
        ? data.autoRefresh
        : "5",
    };
    if (typeof data.relay === "string") {
      try {
        state.relay = migrateRelay(data.relay);
      } catch {
        /* Keep the default if the stored relay is invalid. */
      }
    }
  }
} catch {
  /* Storage may be disabled. */
}

// Transient UI state is intentionally reset on reload.
let view = "reader",
  channel = "all",
  page = 0,
  columns = 49,
  busy = false,
  showAll = false,
  timer;
const getVisibleMessages = () =>
  state.messages.filter(
    (message) => channel === "all" || message.feedId === channel,
  );
const getSelectedMessage = () =>
  getVisibleMessages().find((message) => message.id === state.selectedId) ||
  getVisibleMessages()[0];
const getMessagePages = () => {
  const message = getSelectedMessage();
  return message
    ? wrapMessage(
        (message.title.length > columns ? message.title + "\n\n" : "") +
          message.body,
        columns,
        4,
      )
    : ["Connect a feed in Settings.\nYour messages will appear here."];
};
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Reading works without persistence. */
  }
}
function createElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function createButton(text, action) {
  const element = createElement("button", text);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
}
function showNotice(text, error = false) {
  getElement("notice").hidden = !text;
  getElement("notice").className = error ? "error" : "";
  getElement("notice").setAttribute("role", error ? "alert" : "status");
  getElement("notice").firstElementChild.textContent = text;
}

// Synchronize the LCD, controls, feed list, and inbox. Only the reader marks items read.
function renderPager() {
  const list = getVisibleMessages(),
    message = getSelectedMessage();
  if (message && view === "reader") {
    if (state.selectedId !== message.id) page = 0;
    state.selectedId = message.id;
    message.unread = false;
  }
  const chunks = getMessagePages();
  page = Math.max(0, Math.min(page, chunks.length - 1));
  getElement("unread").textContent =
    `${state.messages.filter((message) => message.unread).length} UNREAD`;
  getElement("sound-status").textContent = state.sound ? "♪ ON ▰" : "♪ OFF ▰";
  getElement("led").classList.toggle("connected", state.feeds.length > 0);
  getElement("source").textContent = message
    ? message.demo
      ? "rss / DEMO CHANNEL"
      : message.feedName
    : "rss / WAITING FOR SIGNAL";
  getElement("title").textContent =
    message?.title || "Your RSS Feeds appear here";
  getElement("copy").textContent = chunks[page];
  getElement("position").textContent =
    `MSG ${message ? list.indexOf(message) + 1 : 0} / ${list.length}`;
  getElement("page").textContent = `PAGE ${page + 1}/${chunks.length}`;
  getElement("story").hidden = !message?.url;
  getElement("story").href = safeUrl(message?.url || "") || "#";
  getElement("previous").disabled =
    view !== "reader" || !message || list.indexOf(message) <= 0;
  getElement("next").disabled =
    view !== "reader" || !message || list.indexOf(message) >= list.length - 1;
  getElement("up").disabled = view !== "reader" || page === 0;
  getElement("down").disabled = view !== "reader" || page >= chunks.length - 1;
  getElement("read").disabled = view !== "reader" || !message;
  getElement("connect-button").disabled = busy;
  getElement("connect-button").textContent = busy ? "Tuning…" : "Connect";
  getElement("refresh").disabled = busy || !state.feeds.length;
  getElement("examples")
    .querySelectorAll("button")
    .forEach((buttonElement) => (buttonElement.disabled = busy));
  getElement("sound").checked = state.sound;
  getElement("refresh-rate").value = state.autoRefresh;
  getElement("channel").replaceChildren(
    new Option("All channels", "all"),
    ...state.feeds.map((feed) => new Option(feed.name, feed.id)),
  );
  getElement("channel").value = channel;
  getElement("feeds").replaceChildren();
  if (!state.feeds.length)
    getElement("feeds").append(
      createElement("p", "No live channels yet.", "hint"),
    );
  for (const feed of state.feeds) {
    const row = createElement("div", undefined, "feed-row");
    const info = createButton(
      `${feed.name} · ${state.messages.filter((message) => message.feedId === feed.id).length}`,
      () => {
        channel = feed.id;
        page = 0;
        showAll = false;
        openView("inbox");
      },
    );
    info.title = `${feed.url} — updated ${feed.updatedAt || "never"}`;
    const remove = createButton("Disconnect", () => {
      state.feeds = state.feeds.filter((x) => x.id !== feed.id);
      state.messages = state.messages.filter((x) => x.feedId !== feed.id);
      if (channel === feed.id) channel = "all";
      page = 0;
      showNotice(`${feed.name} disconnected.`);
      scheduleAutoRefresh();
      renderPager();
    });
    remove.disabled = busy;
    remove.setAttribute("aria-label", `Disconnect ${feed.name}`);
    row.append(info, remove);
    getElement("feeds").append(row);
  }
  getElement("messages").replaceChildren();
  for (const message of showAll ? list : list.slice(0, 5)) {
    // Compare each inbox entry with the selection, rather than with itself.
    const isSelected = message.id === getSelectedMessage()?.id;
    const row = createElement(
      "article",
      undefined,
      `message${isSelected ? " current" : ""}`,
    );
    const title = createButton(
      `${message.unread ? "● " : ""}${message.title}`,
      () => {
        state.selectedId = message.id;
        page = 0;
        openView("reader");
      },
    );
    if (isSelected) title.setAttribute("aria-current", "true");
    row.append(
      title,
      createElement("p", message.body),
      createElement(
        "small",
        `${message.feedName} · ${relativeTime(message.receivedAt, message.demo)}`,
      ),
    );
    if (message.url) {
      const a = createElement("a", "Original story ↗");
      a.href = safeUrl(message.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      row.append(a);
    }
    getElement("messages").append(row);
  }
  if (!list.length)
    getElement("messages").append(
      createElement("p", "No messages on this channel yet."),
    );
  getElement("show-all").hidden = list.length <= 5;
  getElement("show-all").textContent = showAll
    ? "Show fewer messages"
    : `Show all ${list.length} messages`;
  saveState();
}

// View changes use the same selection and page state as keyboard navigation.
function openView(name) {
  view = name;
  for (const id of ["reader", "inbox", "settings", "help"])
    getElement(id).hidden = id !== name;
  document.querySelectorAll("[data-view]").forEach((buttonElement) => {
    if (buttonElement.dataset.view === name)
      buttonElement.setAttribute("aria-current", "page");
    else buttonElement.removeAttribute("aria-current");
  });
  renderPager();
  if (name === "reader") {
    measureScreen();
    getElement("reader").focus({ preventScroll: true });
  }
}
function moveMessage(delta) {
  const list = getVisibleMessages(),
    index = list.indexOf(getSelectedMessage());
  const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
  if (next) {
    state.selectedId = next.id;
    page = 0;
    renderPager();
  }
}
function movePage(delta) {
  page = Math.max(0, Math.min(getMessagePages().length - 1, page + delta));
  renderPager();
}
function readNext() {
  if (page < getMessagePages().length - 1) movePage(1);
  else if (
    getVisibleMessages().indexOf(getSelectedMessage()) <
    getVisibleMessages().length - 1
  )
    moveMessage(1);
  else {
    page = 0;
    renderPager();
  }
}

// Preserve read status and receipt dates. Retain historical items, up to 500 total.
function mergeReceivedFeeds(results) {
  const prior = new Map(state.messages.map((message) => [message.id, message]));
  const incoming = [
    ...new Map(
      results
        .flatMap((r) => r.messages)
        .map((message) => [
          message.id,
          {
            ...message,
            unread: prior.get(message.id)?.unread ?? true,
            receivedAt: prior.get(message.id)?.receivedAt || message.receivedAt,
          },
        ]),
    ).values(),
  ];
  const ids = new Set(incoming.map((message) => message.id));
  const feedIds = new Set(results.map((r) => r.feed.id));
  state.feeds = [
    ...state.feeds.filter((feed) => !feedIds.has(feed.id)),
    ...results.map((r) => r.feed),
  ];
  state.messages = [
    ...incoming,
    ...state.messages.filter(
      (message) => !message.demo && !ids.has(message.id),
    ),
  ].slice(0, 500);
  const count = incoming.filter((message) => !prior.has(message.id)).length;
  if (count) {
    getElement("led").classList.add("receiving");
    setTimeout(() => getElement("led").classList.remove("receiving"), 1800);
    if (state.sound) chirp();
  }
  return count;
}
async function receiveFeed(url) {
  return parseFeed(await fetchFeedXml(url, state.relay), url);
}

// Serialize connections and refreshes with the busy flag to avoid conflicting updates.
async function connectFeed(raw) {
  if (busy) return;
  let url;
  try {
    url = publicFeedUrl(raw.trim()).href;
  } catch (e) {
    showNotice(e.message, true);
    return;
  }
  const existing = state.feeds.find((feed) => feed.url === url);
  if (existing) {
    channel = existing.id;
    showNotice(`${existing.name} is already connected.`);
    renderPager();
    return;
  }
  busy = true;
  showNotice("Finding your signal…");
  renderPager();
  try {
    const result = await receiveFeed(url);
    mergeReceivedFeeds([result]);
    channel = "all";
    state.selectedId = result.messages[0]?.id || "";
    page = 0;
    getElement("feed-url").value = "";
    showNotice(
      `Connected to ${result.feed.name}. ${result.messages.length} messages received.`,
    );
    scheduleAutoRefresh();
  } catch (e) {
    showNotice(e.message, true);
  } finally {
    busy = false;
    renderPager();
  }
}

// Update successful channels even when another publisher fails.
async function refreshFeeds(quiet = false) {
  if (busy || !state.feeds.length) return;
  busy = true;
  if (!quiet) showNotice("Checking channels…");
  renderPager();
  try {
    const results = await Promise.allSettled(
      state.feeds.map((feed) => receiveFeed(feed.url)),
    );
    const good = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
    const failed = results.length - good.length;
    const count = good.length ? mergeReceivedFeeds(good) : 0;
    if (failed)
      showNotice(
        `${count} new messages. ${failed} channel(s) could not refresh. Saved messages remain available.`,
        true,
      );
    else if (!quiet || count)
      showNotice(
        count ? `${count} new messages received.` : "You’re up to date.",
      );
  } finally {
    busy = false;
    renderPager();
  }
}

// Replace the timer when feeds or the interval change.
function scheduleAutoRefresh() {
  clearInterval(timer);
  if (state.autoRefresh !== "off" && state.feeds.length)
    timer = setInterval(
      () => refreshFeeds(true),
      Number(state.autoRefresh) * 60000,
    );
}

// Estimate Courier New character width, then wrap the LCD into four-line pages.
function measureScreen() {
  if (view !== "reader") return;
  const width = getElement("copy").clientWidth;
  const size = parseFloat(getComputedStyle(getElement("copy")).fontSize);
  const next = Math.max(10, Math.floor(width / (size * 0.603)));
  if (next !== columns) {
    columns = next;
    page = 0;
    renderPager();
  }
}

// Register static UI handlers once; dynamic list handlers are created during rendering.
for (const buttonElement of document.querySelectorAll("[data-view]"))
  buttonElement.addEventListener("click", () =>
    openView(buttonElement.dataset.view),
  );
for (const e of EXAMPLES)
  getElement("examples").append(createButton(e.name, () => connectFeed(e.url)));
getElement("connect").addEventListener("submit", (e) => {
  e.preventDefault();
  connectFeed(getElement("feed-url").value);
});
getElement("relay").value = state.relay;
getElement("relay-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    state.relay = validateRelay(getElement("relay").value.trim());
    saveState();
    showNotice("Relay preference saved.");
  } catch (error) {
    showNotice(error.message, true);
  }
});
getElement("sound").addEventListener("change", () => {
  state.sound = getElement("sound").checked;
  if (state.sound) chirp();
  renderPager();
});
getElement("refresh-rate").addEventListener("change", () => {
  state.autoRefresh = getElement("refresh-rate").value;
  scheduleAutoRefresh();
  saveState();
});
getElement("refresh").addEventListener("click", () => refreshFeeds());
getElement("channel").addEventListener("change", () => {
  channel = getElement("channel").value;
  page = 0;
  showAll = false;
  renderPager();
});
getElement("show-all").addEventListener("click", () => {
  showAll = !showAll;
  renderPager();
});
getElement("notice").lastElementChild.addEventListener("click", () =>
  showNotice(""),
);
getElement("previous").addEventListener("click", () => moveMessage(-1));
getElement("next").addEventListener("click", () => moveMessage(1));
getElement("up").addEventListener("click", () => movePage(-1));
getElement("down").addEventListener("click", () => movePage(1));
getElement("read").addEventListener("click", readNext);

// Leave form-field navigation and modified browser shortcuts alone.
document.addEventListener("keydown", (e) => {
  if (
    view !== "reader" ||
    e.target.matches("input,select,textarea") ||
    e.target.isContentEditable ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )
    return;
  const actions = {
    ArrowLeft: () => moveMessage(-1),
    ArrowRight: () => moveMessage(1),
    ArrowUp: () => movePage(-1),
    ArrowDown: () => movePage(1),
  };
  if (actions[e.key]) {
    e.preventDefault();
    actions[e.key]();
  }
});

// Throttle trackpad gestures to avoid skipping several messages at once.
let wheelTime = 0;
getElement("reader").addEventListener(
  "wheel",
  (e) => {
    if (view !== "reader" || Math.abs(e.deltaY) < 3) return;
    const forward = e.deltaY > 0,
      delta = forward ? 1 : -1;
    const canPage = forward ? page < getMessagePages().length - 1 : page > 0;
    const index = getVisibleMessages().indexOf(getSelectedMessage());
    const canMessage = forward
      ? index < getVisibleMessages().length - 1
      : index > 0;
    if (!canPage && !canMessage) return;
    e.preventDefault();
    if (Date.now() - wheelTime < 160) return;
    wheelTime = Date.now();
    if (canPage) movePage(delta);
    else moveMessage(delta);
  },
  { passive: false },
);
function updateClock() {
  getElement("clock").textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
updateClock();
setInterval(updateClock, 10000);

// Initialize from cache, observe screen resizing, and begin scheduled refreshes.
renderPager();
new ResizeObserver(measureScreen).observe(getElement("copy"));
measureScreen();
scheduleAutoRefresh();

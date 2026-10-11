# RSS Pager

A retro-inspired RSS and Atom feed reader, bringing the classic pager experience to the modern web.

Built with **vanilla HTML, CSS, and JavaScript**, RSS Pager combines the nostalgic look and feel of a 1990s pager with the convenience of modern news feeds.

Read headlines, browse articles, manage subscriptions, and receive notifications — all from within an interactive pager interface.

No frameworks. No dependencies. No build process.

## Features

- **Retro pager interface** — Classic LCD-inspired display, physical-style controls, and nostalgic notification sounds.
- **RSS & Atom support** — Subscribe to your favourite news sources, blogs, and websites.
- **Built-in inbox** — Browse messages, filter by channel, and track read status.
- **Pager navigation** — Navigate articles using on-screen buttons, keyboard controls, or scrolling.
- **Feed management** — Add, disconnect, and refresh subscriptions directly from the pager.
- **Automatic refresh** — Choose between manual updates or automatic refresh every 1, 5, or 15 minutes.
- **Notification alerts** — Visual indicators and optional sound alerts for new messages.
- **Offline message history** — Previously saved messages remain accessible through browser storage.
- **Responsive design** — Works across desktop and mobile browsers.
- **Privacy-friendly** — No accounts, analytics, or cloud synchronization.
- **Zero dependencies** — Runs entirely in the browser using native web technologies.

## Getting Started

RSS Pager is a static web application. You can run it locally or deploy it to any static hosting service, including GitHub Pages.

### Preview

[Click here for Live Demo](https://amalk.au/rss-pager/) or to run locally With **Node.js 22 or newer** installed, run:

```bash
pnpm start
```

Open the application in your browser:

http://localhost:4173

No dependencies need to be installed.

To stop the local server, press `Ctrl+C`.

Alternatively, you can use any static HTTP server:

```bash
python3 -m http.server 4173
```

> [!NOTE]
> Opening `index.html` directly using a `file://` URL is not supported because the application uses JavaScript modules. Use a local HTTP server instead.

## Deploy to GitHub Pages

RSS Pager can be deployed directly to GitHub Pages without a build process or deployment workflow.

### 1. Upload the application

Create a new GitHub repository or open an existing one.

Upload the following six files to the repository root:

```text
rss-pager/
├── index.html
├── styles.css
├── pager.js
├── feed.js
├── transport.js
└── .nojekyll
```

The `.nojekyll` file is intentionally empty and disables GitHub Pages' Jekyll processing.

These six files are all that is required to run the application.

### 2. Enable GitHub Pages

1. Open your repository on GitHub.
2. Navigate to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose your publishing branch, typically `main`.
5. Select `/(root)` as the publishing directory.
6. Click **Save**.

GitHub will publish your application and display its URL in the Pages settings.

Your site will typically be available at:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

RSS Pager uses relative asset paths, allowing it to work on both root domains and GitHub Pages project URLs.

### Updating the Application

To publish changes, commit the updated source files to your configured publishing branch.

GitHub Pages will automatically deploy the changes.

No custom GitHub Actions workflow is required.

> [!IMPORTANT]
> Development files such as tests, scripts, and this README may be included in the repository, but they are not required for the deployed application.

For more information, see the [official GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Using RSS Pager

Everything is managed directly through the pager interface.

### Reading Messages

Navigate through incoming feed entries using the pager controls.

| Action                 | Control                    |
| ---------------------- | -------------------------- |
| Previous message       | Left button / Left arrow   |
| Next message           | Right button / Right arrow |
| Previous page          | Up button / Up arrow       |
| Next page              | Down button / Down arrow   |
| Continue reading       | Round button               |
| Scroll through content | Mouse wheel over LCD       |

The round button advances to the next page or, when the current message ends, the next message.

### Inbox

The built-in inbox allows you to:

- Browse saved messages.
- Filter messages by feed channel.
- Select individual articles.
- Return to the complete inbox.
- Open articles on their original websites.

### Settings

All settings are accessible directly from the pager.

You can:

- Add or disconnect RSS and Atom feeds.
- Enable or disable notification sounds.
- Refresh subscriptions manually.
- Configure automatic refresh intervals.
- Change the CORS relay service.

### Built-in Feed Presets

RSS Pager includes quick-connect presets for:

- BBC News
- Hacker News
- The Register

You can also add custom RSS or Atom feed URLs.

### Notifications

When new messages arrive, the pager flashes its notification indicator and optionally plays a classic pager-style alert.

> [!NOTE]
> Some browsers require user interaction before audio playback is permitted.

## How Feed Fetching Works

RSS Pager fetches RSS and Atom feeds directly from your browser.

Because browsers enforce Cross-Origin Resource Sharing (CORS) restrictions, some publishers may require a relay service.

### Request Strategy

The application uses the following approach:

1. Attempt to retrieve the feed directly from its publisher.
2. If the direct request fails or takes longer than **1.2 seconds**, also attempt retrieval through the configured relay.
3. Use the first response containing a valid RSS or Atom feed.
4. Cancel the remaining request.
5. Enforce a **15-second overall request timeout**.

This strategy prioritizes direct connections while providing a fallback for feeds that cannot be accessed directly from the browser.

### Default CORS Relay

The default relay is:

```text
https://proxy.cors.dev/raw?url={url}
```

The `{url}` placeholder is replaced with the URL-encoded feed address.

Only the public feed URL is sent to the relay. No authentication credentials are required.

### Custom Relay Configuration

You can configure a different relay from the pager's Settings menu.

A compatible relay must:

- Use HTTPS.
- Accept a URL template containing `{url}`.
- Return raw RSS or Atom XML.
- Allow browser access through CORS headers.

To disable relay requests entirely, leave the relay setting blank.

### Troubleshooting Feed Connections

Some publishers and public relay services enforce rate limits, restrict access, or experience temporary outages.

If a feed cannot be loaded:

1. Verify that the feed URL is correct.
2. Check whether the publisher provides a valid RSS or Atom feed.
3. Retry the request later.
4. Configure an alternative CORS relay.
5. Try another feed to determine whether the issue is specific to the publisher.

Previously saved messages remain available when a refresh fails.

**Request limits:**

| Limit                         | Value       |
| ----------------------------- | ----------- |
| Relay fallback delay          | 1.2 seconds |
| Overall request timeout       | 15 seconds  |
| Maximum feed response         | 3 MB        |
| Default relay free-tier limit | 1 MiB       |

The relay service may impose additional restrictions independently of RSS Pager.

## Data Storage

RSS Pager stores application data locally using your browser's `localStorage`.

This includes:

- Feed subscriptions.
- Saved messages.
- Read and unread status.
- Current message selection.
- Application preferences.

### Message Retention

To keep local storage manageable, the application enforces the following limits:

| Setting                           | Limit             |
| --------------------------------- | ----------------- |
| Total saved messages              | 500               |
| Entries imported per feed refresh | 50                |
| Maximum body text per entry       | 14,000 characters |

Refreshing a feed preserves existing message history within these limits.

Disconnecting a feed removes its associated messages.

### Privacy

RSS Pager does not require an account or provide cloud synchronization.

All saved application data remains in the browser's local storage.

Feed requests are sent directly to publishers where possible. When a CORS relay is used, the relay receives the requested public feed URL.

> [!NOTE]
> Browser storage is specific to each browser and website origin.
>
> Subscriptions saved on `localhost` will not automatically transfer to a GitHub Pages deployment.
>
> Clearing browser storage may also remove saved subscriptions, messages, and preferences.

### Backward Compatibility

RSS Pager retains compatibility with earlier versions of the application.

The following migration paths are intentionally supported:

- Legacy `advisor-rss-v1` storage data.
- Previous built-in relay configuration.

These compatibility mechanisms preserve existing user data.

Avoid modifying storage keys or migration logic without accounting for previously saved application state.

## Project Structure

The application is organized into a small number of source files.

| File                  | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `index.html`          | Application layout, pager screen, labels, help content, and settings fields.                            |
| `styles.css`          | Pager appearance, LCD styling, typography, colors, and responsive layouts.                              |
| `pager.js`            | Application state, rendering, navigation, events, local storage, and refresh scheduling.                |
| `feed.js`             | Feed presets, demo messages, RSS/Atom parsing, text formatting, URL validation, and notification audio. |
| `transport.js`        | Network requests, relay configuration, fallback behaviour, timeouts, and legacy relay migration.        |
| `scripts/serve.mjs`   | Optional development HTTP server.                                                                       |
| `tests/feed.test.mjs` | Automated regression tests for feed validation, transport, encoding, timeouts, and pagination.          |
| `package.json`        | Development shortcuts for previewing and testing the application.                                       |
| `.nojekyll`           | Disables Jekyll processing on GitHub Pages.                                                             |

### Making Changes

RSS Pager uses standard web technologies without compilation or code generation.

To modify the application:

1. Edit the relevant source file.
2. Save your changes.
3. Reload the browser to preview them.

There are no generated assets or minified source files to maintain.

Important implementation decisions are documented in source comments, including:

- Legacy data migration.
- Plain-text content rendering.
- Message merging and deduplication.
- Request cancellation and timeout handling.

When modifying `index.html`, ensure element IDs remain consistent with their references in `pager.js`.

## Development

RSS Pager is intentionally lightweight.

**Technology stack:**

- HTML5
- CSS3
- Vanilla JavaScript (ES modules)
- Browser Local Storage API
- Native Fetch API
- Node.js (development and testing only)

No frontend framework, package dependencies, bundler, or compilation step is required.

### Running Tests

With Node.js 22 or newer installed, run:

```bash
pnpm test
```

The test suite uses Node.js' built-in test runner.

Tests cover:

- Feed URL validation.
- RSS and Atom handling.
- Transport behaviour.
- Request timeouts.
- URL encoding.
- Message pagination.

No dependency installation is necessary.

## Design Philosophy

RSS Pager is built around a simple idea:

**Modern information, classic hardware-inspired interaction.**

Instead of recreating a conventional news reader, RSS Pager presents syndicated content through the constraints and character of a traditional pager.

The project prioritizes:

- Simplicity over unnecessary complexity.
- Native browser capabilities over frameworks.
- Readability and maintainability.
- Local-first application state.
- A nostalgic, focused reading experience.

## License

This project is released under the **GNU General Public License Version 3 (GPLv3)**. You are free to use, study, modify, and redistribute the contents of this repository in accordance with the terms of the license.

---

**RSS Pager** — _The internet, one beep at a time._

# Development

Developer notes for the `drop-import` plugin. User-facing documentation is in the [README](../README.md), which is also what the plugin registry shows.

## How it works

- Capture-phase `dragover`/`drop` listeners on the window accept file drags outside the editor pane. Without them Inkdrop sets the drop effect to "none" and no drop ever reaches the page.
- Dropped items are resolved to paths with Electron's `webUtils.getPathForFile` and sorted into Markdown-side (`.md`, `.txt`, folders), HTML, and unsupported.
- The plugin dispatches Inkdrop's own `import-markdown:import-from-file` / `import-from-directory` / `import-html:import-from-file` commands. Those commands call the native file picker synchronously; for that one call the plugin's stand-in returns the dropped paths, and the real picker is restored before the command returns.
- The Markdown dialog is watched until it is removed from the page; only then does the HTML dialog open.

Nothing is written to notes by the plugin itself; all imports are performed by Inkdrop's importers. The measured facts this relies on are in [probes/results.md](../probes/results.md); the design in [design.md](design.md).

## Building and testing

Requirements: Node.js 26, npm, Inkdrop 6.x. The helper scripts in `scripts/` are macOS-only (they use `~/Library/Application Support` and `open`); on Windows or Linux, symlink the repository into Inkdrop's packages directory by hand and relaunch Inkdrop with `--remote-debugging-port=9222` yourself.

```sh
npm ci
npm run typecheck
npm test            # unit tests (node --test)
npm run build       # lib/index.js via tsdown; lib/ is committed because releases are served from git tags
```

Install the working copy into Inkdrop as a symlink and relaunch:

```sh
scripts/install-local.sh      # builds, then symlinks the repo into ~/Library/Application Support/inkdrop/packages/drop-import
scripts/relaunch-inkdrop.sh   # quits Inkdrop and relaunches it with --remote-debugging-port=9222 (needed by the E2E harness)
scripts/uninstall-local.sh    # removes that symlink
```

Inkdrop loads plugins at startup, so install, uninstall or rebuild all need a restart of the app. A registry install (`ipm install drop-import`) replaces the symlink with a copy; re-run `install-local.sh` to go back to the working copy.

## End-to-end tests

`e2e/` contains a harness that drives the **running Inkdrop** over the Chrome DevTools Protocol: it dispatches real drag events, walks the import dialogs, and checks the created notes through Inkdrop's local HTTP API.

It operates on your real Inkdrop database. Every run creates a notebook named `E2E Drop Import`, imports fixtures into it, and removes everything it created before exiting (also on failure). Do not run it against notes you cannot afford to lose if the process is killed mid-run.

Prerequisites: the plugin installed, Inkdrop relaunched with `scripts/relaunch-inkdrop.sh`, Inkdrop's local HTTP server enabled (Preferences → Local HTTP Server), and a gitignored `e2e/.env.local`:

```dotenv
INKDROP_LOCAL_SERVER_URL=http://127.0.0.1:19840
INKDROP_LOCAL_USERNAME=your-local-server-username
INKDROP_LOCAL_PASSWORD=your-local-server-password
INKDROP_DEVTOOLS_PORT=9222
```

```sh
node e2e/run.mjs --mode direct   # exercises Inkdrop's importers without the plugin
node e2e/run.mjs --mode drop     # exercises the plugin with real drag events
```

Keep the Inkdrop window visible during a run: a hidden window does not render dialog changes, and the harness re-focuses it when needed. Scenario list and discovered selectors: [e2e/README.md](../e2e/README.md). Latest results: [e2e/REPORT.md](../e2e/REPORT.md) and [evidence](evidence).

## Repository layout

| Path | Contents |
|---|---|
| `src/` | plugin source (TypeScript) and unit tests |
| `lib/` | build output, committed (what the registry delivers) |
| `e2e/` | live end-to-end harness |
| `probes/` | scripts that measured Inkdrop's behavior, and their results |
| `docs/design.md` | the design the implementation follows |
| `docs/releasing.md` | publishing to the Inkdrop plugin registry |
| `scripts/` | local install, uninstall and relaunch helpers |

## Releasing

```sh
npm run build
npm version patch
git push --follow-tags   # the tag must exist on GitHub before publishing
ipm publish
```

Full procedure, registry mechanics and unpublishing: [releasing.md](releasing.md).

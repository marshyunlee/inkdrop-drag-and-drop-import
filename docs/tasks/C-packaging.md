role: implementer
Task C — packaging, local install and relaunch scripts, README for the Inkdrop "drop-import" plugin

Repository: <repository root> (git, branch master). Work directly in it.
Read first: docs/design.md (§2 formats, §7 limits), probes/results.md ("Harness requirements"
and the environment table), package.json / tsconfig.json / tsdown.config.js (already set up;
the build runs with `npm run build`).
Also read ~/AGENTS.md: its implementation rules apply to every file you write.

## Target
Files you own: README.md, scripts/install-local.sh, scripts/uninstall-local.sh,
scripts/relaunch-inkdrop.sh, LICENSE (MIT, holder: the repository owner). You may adjust
tsdown.config.js only if the build output is wrong; say so in the report.
Do not edit src/, e2e/, probes/, docs/, package.json, tsconfig.json. Do not add dependencies.

## Facts
- Inkdrop 6.2.0 loads plugins from `~/Library/Application Support/inkdrop/packages/<name>`
  (and `dev/packages` only when its devMode preference is on; it is off here). There is no
  `ipm` CLI in 6.2.0. A plugin dir needs package.json with "main" and "engines.inkdrop", and the
  built lib/.
- Inkdrop must be restarted to load or reload a plugin.
- The E2E harness drives Inkdrop over the Chrome DevTools Protocol; Inkdrop has to be launched
  as `/Applications/Inkdrop.app/Contents/MacOS/Inkdrop --remote-debugging-port=9222`, which is
  what `open -na /Applications/Inkdrop.app --args --remote-debugging-port=9222` does.
  Readiness: `http://127.0.0.1:9222/json/version` answers, and the local note server answers
  on `http://127.0.0.1:19840/` (401 without credentials is "up").
- Quitting: `kill -TERM <pid of /Applications/Inkdrop.app/Contents/MacOS/Inkdrop>` exits cleanly
  within a few seconds (measured). `pgrep -x Inkdrop` finds it.

## Change
1. scripts/install-local.sh — builds (`npm run build`), then symlinks the repo directory to
   `~/Library/Application Support/inkdrop/packages/drop-import`. Idempotent: an existing
   symlink pointing elsewhere is replaced; an existing real directory is left alone and the
   script exits non-zero with a message. Ends by printing that Inkdrop must be restarted
   (`scripts/relaunch-inkdrop.sh` for a debuggable relaunch, or quit and reopen the app).
2. scripts/uninstall-local.sh — removes that symlink only if it is a symlink into this repo.
3. scripts/relaunch-inkdrop.sh — quits a running Inkdrop (SIGTERM, wait up to 20 s, then
   report failure; never SIGKILL), relaunches with the remote-debugging port (default 9222,
   override via `INKDROP_DEVTOOLS_PORT`), waits up to 60 s for both readiness URLs, prints the
   new pid, exits non-zero on timeout. Works when Inkdrop was not running.
4. README.md — what the plugin does; the exact format table from docs/design.md §2; where
   drops work (everywhere except the editor pane); the two-dialog behavior for mixed drops;
   the Dock-icon limit; install from source (the two scripts); how to run unit tests and the E2E
   harness (`npm run e2e`, which needs e2e/.env.local with INKDROP_LOCAL_SERVER_URL,
   INKDROP_LOCAL_USERNAME, INKDROP_LOCAL_PASSWORD, INKDROP_DEVTOOLS_PORT); the note that the
   picker stand-in depends on Inkdrop internals (design §4) so an Inkdrop update may break it.
5. Verify the build: `npm run build` → lib/index.js exists, is CommonJS, and references
   'inkdrop' and 'electron' through require instead of inlining them. If tsdown inlines either,
   fix tsdown.config.js and report the change. (src/index.ts may still be a stub while you work;
   if it is missing, create nothing — build against whatever src/ contains and say so.)

## Constraints
- Scripts: `#!/usr/bin/env bash`, `set -euo pipefail`, no `cd` side effects outside the script,
  paths quoted, macOS-only is fine (say so at the top).
- No comments that narrate the task. README states facts; no marketing.

## Observable acceptance
- `bash -n` passes on all three scripts; `shellcheck` if installed.
- Run install-local.sh and uninstall-local.sh for real and show `ls -l` of the packages dir
  before/after. Do NOT run relaunch-inkdrop.sh yourself (the coordinator owns the running app);
  instead unit-check it with `bash -n` and a dry read-through, and state that it is unexecuted.
- Commit on master (configure a git identity first if none is set).
- Final report: file list, the build verification output, and anything left unverified.

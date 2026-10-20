role: implementer
Task A — plugin core for the Inkdrop "drop-import" plugin

Repository: <repository root> (git, branch master). Work directly in it.
Read first, in this order: docs/design.md (the agreed design), probes/results.md (measured facts
about Inkdrop 6.2.0 the design depends on), src/types.ts (the shared contract you code against).
Also read ~/AGENTS.md: its implementation rules (naming, no unnecessary comments, no planning
jargon in code, no temporary safeguards) apply to every file you write.

## Target
Files you own and create: src/index.ts, src/drop-listener.ts, src/dispatch-import.ts,
src/wait-for-wizard-close.ts, and their unit tests src/*.test.ts for the pure parts.
You may read everything else. Do not edit src/types.ts, src/classify-paths.ts,
src/resolve-dropped-paths.ts (another worker owns them; today they are stubs with the final
signatures), package.json, tsconfig.json, tsdown.config.js, probes/, e2e/, docs/.
Do not add dependencies.

## Change
Implement the plugin exactly as docs/design.md §4–§6 describes, using the facts in
probes/results.md:

1. src/index.ts — default-export an instance of a class implementing IInkdropPlugin
   (from '@inkdropapp/types') with activate(app: Environment) and deactivate(). Pattern to
   copy: ~/Library/Application Support/inkdrop/packages/insert-date/src/index.ts.
   activate installs the drop listener; deactivate removes every listener and disconnects any
   observer. No config, no commands, no menus.

2. src/drop-listener.ts — exports a function that attaches capture-phase 'dragover' and 'drop'
   listeners on window and returns a dispose function.
   - Ignore events whose target is inside the editor pane: `target.closest(EDITOR_PANE_SELECTOR)`
     (constant from src/types.ts). Those events must be left completely untouched so Inkdrop's
     own editor drop behavior keeps working.
   - Ignore drags that carry no files (`dataTransfer.types` lacks 'Files').
   - dragover outside the editor: preventDefault, stopPropagation, dropEffect = 'copy'
     (probes/results.md §3 shows this is required; without stopPropagation Inkdrop's own
     handler sets dropEffect 'none' and the drop never fires).
   - drop outside the editor: preventDefault, stopPropagation, then
     resolveDroppedPaths(dataTransfer.files) → classifyPaths(paths, fs.statSync) → hand the
     ClassifiedPaths to the import sequence in src/dispatch-import.ts.

3. src/dispatch-import.ts — the sequence from design §5:
   - unsupported items non-empty → one `app.notifications.addWarning` (or addInfo) naming the
     item basenames; never pass them to a dialog.
   - markdown items non-empty → dispatchImportWithPaths(app, isFolderOnly ?
     IMPORT_COMMANDS.markdownFolders : IMPORT_COMMANDS.markdownFiles, markdown), then await
     waitForWizardClose(MARKDOWN_WIZARD_SELECTOR).
   - html items non-empty → dispatchImportWithPaths(app, IMPORT_COMMANDS.htmlFiles, html).
   - dispatchImportWithPaths replaces `app.dialog.showOpenDialog` with an own property that
     resolves `{ canceled: false, filePaths }`, dispatches the command on document.body, and
     restores the original in `finally` (probes/results.md §2: the importer calls it synchronously
     during dispatch, and the instance has no own property, so `delete` restores the prototype
     method cleanly). It returns whether the stand-in was called. If it was not called, show
     `app.notifications.addError` saying the built-in importer is not available (it is disabled or
     missing) and skip the rest of the sequence.
   - Keep the sequence testable: accept the collaborators (dispatch, dialog object, notifications,
     waitForWizardClose) as parameters or through a small options object, so the unit tests can
     pass fakes without a DOM. Default-wire the real ones in index.ts.

4. src/wait-for-wizard-close.ts — resolves when no element matches the selector. Facts from
   probes/results.md §5: the wizard root is appended to `.modal-layout` about a second after
   dispatch and is removed from the DOM on close. Implement: if no element matches yet, wait
   for it to appear (MutationObserver on document.body, childList+subtree, with an upper bound
   of ~5 s after which resolve anyway — the importer may have refused silently); then wait for
   it to disappear (observer on its parent). No polling timers besides the single upper bound.

## Constraints
- Nothing is written to any note. The plugin only opens Inkdrop's own dialogs.
- Only `window`-level capture listeners; never touch Inkdrop's DOM or React internals.
- `require('fs')` / `import fs from 'fs'` is fine (renderer has nodeIntegration). Use
  `fs.statSync` as the StatFunction.
- Names: functions start with a verb and name their object; booleans isXxx. No comments that
  describe the situation or the task; at most one short line where the why is non-obvious.
- `npx tsc --noEmit` must pass with the stubs in place. `npm test` runs `node --test src/*.test.ts`
  (Node 26 strips types natively; import local files with the `.ts` extension).

## Observable acceptance
- `npx tsc --noEmit` exits 0.
- `npm test` exits 0 and includes tests for: the stand-in is restored after dispatch (success and
  throw); the "not called" path raises the error notification and skips HTML; the
  markdown→html ordering waits for the wizard to close in between; folder-only drops use the
  folders command; unsupported-only drops produce exactly one notification and no dispatch.
- `npm run build` produces lib/index.js that does not inline 'inkdrop' or 'electron'
  (grep for `require("inkdrop")` / `require("electron")` or their ESM equivalents in lib/index.js).
- Commit your work on master with a message describing the change (configure a git identity first if none is set).
- In your final report list each file, the test names, and anything in the design you could not
  implement as written and why.

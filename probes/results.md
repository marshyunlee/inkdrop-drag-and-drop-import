# Probe results — Inkdrop 6.2.0, Electron 44.7.0, macOS, 2026-10-20

Measured with `probes/run-probes.mjs` and follow-ups over CDP (`--remote-debugging-port=9222`).
These are facts the implementation relies on. Raw data: `probes/results.json`.

## Environment

| Check | Result |
|---|---|
| `typeof require` in the renderer | `function` (nodeIntegration on, contextIsolation off) |
| `typeof inkdrop` (global) | `object`, `inkdrop.appVersion === "6.2.0"` |
| `require('electron').webUtils.getPathForFile` | present |
| `File.path` on dropped files | `null` (removed in Electron 44; use `webUtils`) |
| `inkdrop.dialog.showOpenDialog` | inherited from the prototype; the instance has no own property, so an own-property stand-in shadows it and `delete`/reassignment restores it |

## 1. Dropped paths resolve (PASS)

A capture-phase `drop` listener on `window` received, per drop:

| Dropped | `dataTransfer.files` | `webUtils.getPathForFile` |
|---|---|---|
| `one.md` | 1 file | absolute path of the file |
| `folder/` | 1 "file" named `folder` | absolute path of the folder |
| `one.md` + `folder/` | 2 | both, in drop order |

`dataTransfer.types` = `["text/uri-list", "Files"]`. The folder arrives as a File object with the folder's name.

## 2. Picker stand-in works (PASS)

Replacing `inkdrop.dialog.showOpenDialog` with `async () => ({ canceled: false, filePaths })`, then
`inkdrop.commands.dispatch(document.body, 'import-markdown:import-from-file')`:

- the stand-in was called **once, synchronously, before `dispatch` returned** (`dispatch` returned `true`);
- it was called with `title: "Open Markdown file"` (the importer's own options);
- restoring in `finally` left `showOpenDialog === original`;
- ~1.2 s later the built-in wizard showed `Going to import 1 Markdown file (0.0 KB total): 1 file — no new notebook` with buttons `Cancel`, `Next`.

So the importer calls the same `dialog` object plugins get, and the stand-in is never visible to any other caller.

## 3. Capture-phase handlers let drops through (PASS)

Without handlers, a CDP drag sequence (dragEnter → dragOver → drop) over the sidebar produced **0** `drop` events: Inkdrop's own `dragover` handler sets `dropEffect = "none"`.
With `window.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }, true)` and a capture-phase `drop` listener, all 3 drops fired.
No `drag*`/`drop` listeners are registered on `window`, `document` or `document.body` by Inkdrop itself (DOMDebugger.getEventListeners); its handlers sit deeper in the tree, so a capture listener on `window` runs first and `stopPropagation()` keeps Inkdrop's from running.

## 4. Editor region (measured)

Viewport 1344×1008 at the time. Layout:

| Region | Selector | Rect (x, y, w, h) |
|---|---|---|
| Notebook sidebar | `.sidebar-menu` | 0, 40, 202, 928 |
| Notebook rows | `.sidebar-menu-book-list-item` | first at 0, 130, 202, 30 |
| Note list | `.note-list-bar` | 203, 119, 299, 889 |
| Editor pane | `.editor` | 503, 108, 841, 900 |

Notes:
- `.sidebar` is an 18×18 icon, not the sidebar. Use `.sidebar-menu`.
- In preview mode the editor pane is `.editor.editor-viewmode-preview`; `.mde` is `hidden` and `.cm-editor` has a 0×0 rect. The exclusion selector must be the pane, **`.editor`**, not `.cm-editor`.
- Ancestors of the editor: `.editor` → `.mde-layout` → `.editor-layout` → `.main-layout`.

## 5. Wizard close = DOM removal (PASS)

- Open wizard: `div.modal-container.visible.import-markdown-wizard-dialog.import-markdown-wizard-dialog--stats`, child of `div.modal-layout`.
- On Cancel: several `style` attribute mutations on the dialog (its exit animation), then one `childList` mutation on `.modal-layout` removing the node. `document.querySelector('.import-markdown-wizard-dialog')` is `null` afterwards.
- The HTML wizard's root is `.import-html-wizard-dialog` (from its source); same `modal-layout` parent is expected but not measured.

## Harness requirements learned the hard way

- **The window must be visible.** With the window occluded, `document.visibilityState` was `"hidden"`; React never committed the close (no mutations at all, for `button.click()`, a CDP mouse click, and Escape). `await inkdrop.window.show(); await inkdrop.window.focus()` made it visible and the pending close committed at once. The harness calls both before every scenario.
- `button.click()` on wizard buttons works once the window is visible. CDP `Input.dispatchMouseEvent` also hits the button (`elementFromPoint` returned it).
- Inkdrop's local HTTP API (`127.0.0.1:19840`, basic auth) stays up across the relaunch and can verify created notes/notebooks.

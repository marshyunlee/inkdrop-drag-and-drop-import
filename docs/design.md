# Drop Import — design

An Inkdrop desktop plugin: drag Markdown or HTML files, or folders, from Finder onto the Inkdrop window, and Inkdrop's **own** import dialog opens with those items already filled in. You still pick the notebook in that dialog.

Status: implemented 2026-10-20 (see README.md and e2e/REPORT.md). Target: Inkdrop 6.2.0 desktop (macOS), Electron 44.7.0. No community plugin does this (registry search, 2026-10-19).

---

## 1. Decisions (confirmed with you)

| Topic | Decision |
|---|---|
| Which dialog | Inkdrop's built-in import dialogs, opened with the dropped paths (route A, §4) |
| Notebook | Never preset. The dialog's notebook step always appears, even when you drop onto a notebook in the sidebar. |
| Drop area | Anywhere in the window **except the note editor**, which keeps today's behavior (§6) |
| File types | `.md`, `.txt`, `.html`, `.htm`, plus folders (§2) |
| Several items | All Markdown-side items (files and folders) go into **one** Markdown dialog, which lists them all before import |
| Folders | Imported with the "from Markdown folders.." command |
| Markdown + HTML in one drag | Two dialogs in a row: Markdown first, then HTML once it closes |
| Unsupported items | Never passed to a dialog. One notification names them. |

## 2. Supported formats

Read from the built-in importer source shipped in the app (`app.asar` → `packages/import-markdown/src/importer.ts`, `packages/import-html/src/importer.ts`).

| Dropped item | Built-in dialog | What gets imported |
|---|---|---|
| `.md` file | Import Notes from Markdown | One note. Title from frontmatter `title` or the first `# h1`. Local images it links to become attachments. |
| `.txt` file | Import Notes from Markdown | One note, the text read as Markdown |
| Folder | Import Notes from Markdown ("from Markdown folders..") | Every `.md` at any depth. Subfolders become nested notebooks. Linked images (`.png .jpg .jpeg .gif .svg`) become attachments. Folders with no `.md` anywhere are skipped. **`.txt` files inside a folder are not imported** (the folder scan only takes `.md`). |
| `.html` / `.htm` file | Import Notes from HTML | One note, converted to Markdown, with local images attached |
| Anything else (`.pdf`, `.docx`, images on their own, …) | — | Not imported; named in the notification |

How the built-in Markdown dialog treats several items (from `previewImport` / `importMarkdownFromMultipleFilesAndDirectories`):
- **One folder dropped alone:** its files land directly in the notebook you pick, and its subfolders become notebooks under it. The folder itself does **not** become a notebook.
- **A folder dropped together with other items:** each folder becomes its own notebook under the one you pick.
- **Loose files** go straight into the notebook you pick ("N files — no new notebook" in the summary).
- **Any file over the attachment size limit** (`maxAttachmentFileSize`) stops the dialog with an error until it's removed.
- The summary step lists counts and the notebook tree, but you can't deselect individual items. The choices are Cancel or Next.

## 3. What dropping does in Inkdrop today

Read from `renderer/assets/app--8nT0s9w.js` in the 6.2.0 bundle:
- **Window-wide:** a `dragover` handler sets the drop effect to `none`, so the cursor shows "not allowed" everywhere and nothing happens on drop.
- **Note editor (CodeMirror 6):** dropped files are sent to the `editor:insert-images` command at the drop position.

The plugin adds handling only outside the editor.

## 4. The technical blocker and the workaround

**Blocker:** none of the built-in import commands accepts file paths. Each one starts by asking the native file picker for them:

```ts
// packages/import-markdown/src/index.tsx
const { filePaths: pickedPaths } = await openDialog()   // → getEnv().dialog.showOpenDialog(...)
```

The only input a command takes is `detail.bookId` (a preset notebook, which we don't want). The wizard component isn't exported for other plugins.

**Workaround (route A, chosen): stand in for the picker once.**

```ts
function dispatchImportWithPaths(app: Environment, command: string, filePaths: string[]): boolean {
  const dialog = app.dialog
  const originalShowOpenDialog = dialog.showOpenDialog
  let wasPickerRequested = false
  dialog.showOpenDialog = async () => {
    wasPickerRequested = true
    return { canceled: false, filePaths }
  }
  try {
    app.commands.dispatch(document.body, command)
  } finally {
    dialog.showOpenDialog = originalShowOpenDialog
  }
  return wasPickerRequested
}
```

- **Why it works:** the command handler calls the picker *synchronously*, before its first `await` (`startWizard` → `openDialog()` → `showOpenDialog`). By the time `dispatch` returns, the stand-in has already been called and the original is back. No timer, and no window where a real "Open" dialog could be hijacked.
- If `wasPickerRequested` is false, the importer didn't run (e.g. disabled under Preferences → Plugins). The plugin shows an error notification and stops.
- **Cost:** this depends on Inkdrop internals: the commands call `env.dialog.showOpenDialog`, synchronously, on the same `dialog` object plugins receive. An Inkdrop update can break it, and §8 lists how to detect that.

## 5. Flow

```
drag enters window
  dragover (capture phase, outside editor, carries files) → preventDefault, dropEffect = "copy"
drop (capture phase, outside editor)
  1. preventDefault + stopPropagation
  2. paths   = dataTransfer.files → webUtils.getPathForFile(file)
  3. classify each path with fs.stat + extension:
        folder          → markdownItems
        .md / .txt      → markdownItems
        .html / .htm    → htmlItems
        else            → unsupportedItems
  4. if unsupportedItems: one notification listing their names
  5. if markdownItems:
        only folders  → dispatchImportWithPaths("import-markdown:import-from-directory", markdownItems)
        otherwise     → dispatchImportWithPaths("import-markdown:import-from-file", markdownItems)
     wait until the Markdown dialog closes (§6)
  6. if htmlItems:
        dispatchImportWithPaths("import-html:import-from-file", htmlItems)
```

During `dragover` the browser only reveals that files are being dragged, not their names. So the cursor shows "copy" for any file drag outside the editor, and filtering happens on drop.

Both Markdown commands open the same wizard. On macOS the "files" picker also accepts folders (`openFile` + `openDirectory`). With the picker replaced, the two commands behave identically. The folder command is used for folder-only drops to match the menu item you named.

## 6. Plugin structure

```
drop-import/
  package.json        name "drop-import", main "./lib/index", engines { inkdrop: "^6.0.0" }
  src/index.ts        class DropImportPlugin { activate(app), deactivate() }
  src/drop-listener.ts     capture-phase dragover/drop on window; editor exclusion
  src/classify-paths.ts    path → markdown | html | unsupported   (pure, unit-tested)
  src/dispatch-import.ts   dispatchImportWithPaths + the Markdown → HTML sequence
  src/wait-for-wizard-close.ts   resolves when the wizard node is removed
```

- **Editor exclusion:** skip any event whose target is inside the editor pane (`event.target.closest('.editor')`). Measured in probes/results.md §4: in preview mode `.cm-editor` has a 0×0 rect, so the pane is the only selector that covers edit, preview and side-by-side modes.
- **Waiting for the Markdown dialog to close:** the dialog root carries the class `import-markdown-wizard-dialog` (from `import-wizard-dialog.tsx`). A `MutationObserver` waits for the node to be removed from the DOM (measured in probes/results.md §5: Inkdrop removes it on close), then the HTML dialog opens.
- **Lifecycle:** `deactivate` removes both listeners and disconnects the observer.
- **No settings, no commands, no menus.**

## 7. Out of scope

- Dropping on the Dock icon. macOS delivers that to the main process as an open-file event, which plugins can't see.
- Dropping onto the editor (unchanged by design).
- Choosing which dropped items to import inside the dialog (the built-in dialog has no per-item selection).
- Any format beyond §2.

## 8. Verify first (a short test inside the running app)

Ordered by what blocks the most:

1. `require('electron').webUtils.getPathForFile(file)` returns absolute paths for dropped **files and folders**. Electron 44 removed `file.path`, and the bundle never calls `webUtils`. The window runs with `nodeIntegration: true, contextIsolation: false`, so it should be reachable. If it isn't, folders can't be supported and this is a blocker.
2. `app.dialog` is the same object the built-in importers call (`getEnv().dialog`), and `commands.dispatch` runs the handler synchronously, so the stand-in is hit before `dispatch` returns.
3. A capture-phase `dragover` listener on `window` can override Inkdrop's "not allowed" drop effect.
4. The editor root selector covers the whole drop area of the editor, including in side-by-side preview mode. Result: `.editor` (the pane), not `.cm-editor`; see probes/results.md §4.
5. Whether a closed dialog is removed from the page or only hidden (which decides how the observer detects closing).

## 9. Test plan

- **Unit:** `classify-paths` — every extension in §2 (upper and lower case), folders, a symlink, a missing path.
- **Manual, in Inkdrop 6.2.0:**
  - one `.md` (the dialog in your screenshot appears; Next → notebook step → note created);
  - several `.md` + `.txt`;
  - one folder;
  - two folders;
  - folder + files;
  - `.html` alone;
  - `.md` + `.html` (two dialogs in a row);
  - `.pdf` alone (notification only);
  - a drop on the editor (inserts as today, no dialog);
  - Cancel in each dialog;
  - built-in importer disabled (error notification);
  - after each case, File → Import → from Markdown files.. still shows the real Finder picker, which proves the stand-in never leaks.

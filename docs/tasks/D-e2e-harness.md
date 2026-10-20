role: implementer
Task D — end-to-end harness for the Inkdrop "drop-import" plugin (CDP-driven, against the live app)

Repository: <repository root> (git, branch master). Work directly in it.
Read first: docs/design.md (§2 formats, §5 flow, §9 test plan = your scenario list),
probes/results.md (every measured fact: coordinates, selectors, the window-visibility rule,
how the wizard closes), probes/cdp.mjs (a working dependency-free CDP client; reuse it by
importing '../probes/cdp.mjs' or copy it into e2e/ — your call, say which), probes/run-probes.mjs
and probes/recheck-close.mjs (working examples of drag dispatch and dialog interaction).
Also read ~/AGENTS.md: its implementation rules apply to every file you write.

## Environment you can use
- Inkdrop 6.2.0 is running now with `--remote-debugging-port=9222`; the renderer page is the
  target whose url contains `renderer/index.html`. It is the owner's real app and database, so
  every note or notebook you create must be removed by your harness before it exits.
- Local note API: read e2e/.env.local (KEY=VALUE lines; already present, gitignored) for
  INKDROP_LOCAL_SERVER_URL, INKDROP_LOCAL_USERNAME, INKDROP_LOCAL_PASSWORD, INKDROP_DEVTOOLS_PORT.
  Endpoints: GET /books, GET /notes?keyword=..&limit=.., GET /<docId>, POST /notes (JSON body
  {bookId,title,body}), POST /books ({name,parentBookId?}) — verify the POST /books shape by
  trying it. There is no HTTP delete; delete through the renderer instead:
  `inkdrop.localDB.notes.remove(noteId)`, `inkdrop.localDB.utils.deleteBook(bookId)` (types in
  node_modules/@inkdropapp/types/src/ipc/db.d.ts).
- The plugin itself is being written by other workers in parallel and is NOT installed yet.

## Target
Files you own: everything under e2e/ (e.g. e2e/run.mjs, e2e/lib/*.mjs, e2e/scenarios/*.mjs).
Do not edit src/, probes/, docs/, scripts/, package.json. Do not add dependencies
(Node 26: global fetch and WebSocket are available).

## Change
Build `node e2e/run.mjs [--mode direct|drop] [--only <scenario>]` that:

1. Loads e2e/.env.local, connects over CDP, and before every scenario runs
   `await inkdrop.window.show(); await inkdrop.window.focus()` in the renderer (probes/results.md:
   a hidden window never renders dialog changes).
2. Creates a fixture tree under e2e/fixtures/ (gitignored) at start: `a.md`, `b.MD`, `c.txt`,
   `page.html`, `page2.htm`, `skip.pdf`, `folder1/{x.md,y.md,sub/z.md}`, `folder2/w.md`,
   `empty-folder/` (no md). Small bodies with a unique marker per file (e.g. the file name) so
   notes can be matched by keyword search.
3. Creates a dedicated notebook named `E2E Drop Import` (via POST /books, or
   `inkdrop.localDB.books.put` from the renderer if the HTTP shape rejects) and remembers its id.
   Every import in every scenario targets ONLY this notebook. At the end (also on failure, via
   try/finally) it trashes/removes every note in that notebook and deletes the notebook, then
   reports what it removed.
4. Two modes for triggering the built-in wizard:
   - `direct`: the harness itself installs the picker stand-in in the renderer and dispatches the
     import command (exactly as probes/recheck-close.mjs does). This proves the dialog walk,
     verification and cleanup without the plugin, and must be green today.
   - `drop`: the harness dispatches `Input.dispatchDragEvent` dragEnter/dragOver/drop with the
     fixture paths at a point inside `.sidebar-menu` (or `.note-list-bar` for the "note list"
     scenario) and expects the plugin to open the wizard. Will fail until the plugin is installed;
     build it anyway, that is what the coordinator runs in Phase 2.
5. Walks the wizard from the renderer: wait for `.import-markdown-wizard-dialog` (or the html
   one) to appear; read its summary text; click `Next` (button.click() works when the window is
   visible); on the notebook step select the `E2E Drop Import` notebook — discover the notebook
   list item selector/behavior by inspecting the live dialog once (NotebookListBar; record what
   you found in e2e/README.md); click `Import`; wait for the wizard node to be removed from
   `.modal-layout`; then assert via the HTTP API.
6. Scenarios (each prints `PASS`/`FAIL name — detail`; exit code 1 if any fail), from design §9:
   - single-md: 1 note titled from `# heading`/file name in the notebook.
   - md-and-txt: a.md + b.MD + c.txt → 3 notes.
   - single-folder: folder1 alone → its direct .md files go straight into the notebook, `sub`
     becomes a child notebook (design §2 "one folder dropped alone").
   - two-folders: folder1 + folder2 → two child notebooks named folder1 and folder2.
   - folder-and-files: folder2 + a.md → child notebook folder2 plus a direct note.
   - empty-folder: no note, no notebook, wizard summary shows 0 files (or the wizard may not
     open; record the actual behavior and assert it).
   - html-alone: page.html → HTML wizard, 1 note.
   - md-then-html (drop mode only): a.md + page.html in one drop → Markdown wizard first; after
     it closes the HTML wizard opens; 2 notes total.
   - unsupported-only (drop mode only): skip.pdf → no wizard; a notification mentions skip.pdf
     (discover the notification DOM once; record the selector).
   - editor-drop (drop mode only): FIRST open a scratch note that belongs to the E2E notebook
     (create it via API, open it in the editor — find the command, e.g. by searching
     `inkdrop.commands` registrations for 'open-note'; record it), then drop a.md inside
     `.editor`; assert NO import wizard appears within 3 s. Never run this scenario while a
     non-E2E note is open.
   - cancel: open wizard, click Cancel, assert no new notes.
   - oversized: skip; note in README that the >limit case is not covered.
   In direct mode run every scenario that does not say "drop mode only".
7. Each scenario cleans its own notes/child notebooks so counts do not leak between scenarios
   (search by the fixture markers, remove via renderer), and the harness never touches notes
   outside the E2E notebook.

## Constraints
- No sleeps-as-synchronization: wait on DOM observation (poll the renderer every 100 ms with an
  upper bound is acceptable from the harness side) and on API results.
- One CDP connection per run; close it on exit.
- Never dispatch a drop over `.editor` except in the editor-drop scenario.
- Keep the owner's data safe: every mutation goes to the E2E notebook; cleanup in finally.

## Observable acceptance
- `node e2e/run.mjs --mode direct` prints PASS for every direct-mode scenario and exits 0; paste
  its full output in the report. After it exits, `GET /books` shows no `E2E Drop Import` notebook
  and `GET /notes?keyword=<marker>` finds none of the fixture markers; show that too.
- `node e2e/run.mjs --mode drop` runs to completion (expected FAILs because the plugin is absent)
  and still cleans up; show its output.
- e2e/README.md documents usage, modes, scenario list, and the selectors/commands you discovered.
- Commit on master (configure a git identity first if none is set).

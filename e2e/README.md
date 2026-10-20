# Live Inkdrop end-to-end harness

Run from the repository root with Node 26 and Inkdrop running with
`--remote-debugging-port=9222`:

```sh
node e2e/run.mjs --mode direct
node e2e/run.mjs --mode drop
node e2e/run.mjs --mode drop --only md-then-html
node e2e/run.mjs --help
```

`direct` is the default. The harness reads the gitignored `e2e/.env.local`:

```dotenv
INKDROP_LOCAL_SERVER_URL=http://127.0.0.1:19840
INKDROP_LOCAL_USERNAME=<local API username>
INKDROP_LOCAL_PASSWORD=<local API password>
INKDROP_DEVTOOLS_PORT=9222
```

Keep the local HTTP server enabled and avoid restarting Inkdrop during a run.
An HTTP readiness check runs before CDP connection or notebook creation; an
unavailable local server produces a clear setup failure and exit code 1.
The harness shows and focuses Inkdrop before every scenario, dismisses all
notifications, and waits until their DOM nodes are removed. Its live UI is
temporarily occupied by import dialogs; the previous note is reopened afterward.
No dependencies are added.

## Modes and checks

`direct` substitutes `inkdrop.dialog.showOpenDialog` only around the synchronous
import command dispatch, then restores its original property descriptor. This
exercises the built-in importers without installing the drop-import plugin.

`drop` sends CDP `Input.dispatchDragEvent` `dragEnter`, `dragOver`, and `drop`
with the fixture paths. It installs no drag listeners or picker substitute.
Positive import cases therefore fail when the plugin is absent.
Every successful drop scenario also checks that `showOpenDialog` is an inherited
function with no own-property stand-in, and prints `picker restored`.

The shared dependency-free CDP client is imported from `../probes/cdp.mjs`.
There is one connection per run, closed in the outer `finally`. The harness
adds a 15-second bound to CDP operations; DOM/API conditions are polled every
100 ms, normally for at most 10 seconds (20 seconds for completed imports,
30 seconds for dismissing remaining dialogs). The 3-second negative checks
observe repeatedly throughout the interval.

Inkdrop can stop committing React updates when another window covers it, so every polling and negative-observation tick checks `document.visibilityState` and calls `show()` and `focus()` when hidden.
The harness logs one `REFOCUS` line per scenario that needs recovery, and polling timeouts include the current visibility state.

Every scenario prints `PASS`, `FAIL`, or `SKIP`; any failure sets exit code 1.
Unknown scenario/mode arguments also exit 1. A failure does not prevent later
scenarios unless cleanup fails.

| Scenario | Modes | Expected result |
|---|---|---|
| `single-md` | Both | `a.md`: one direct note, matching heading/file title |
| `md-and-txt` | Both | `a.md`, `b.MD`, `c.txt`: three direct notes |
| `single-folder` | Both | `folder1`: x/y direct, z in child `sub` |
| `two-folders` | Both | Child `folder1` with nested `sub`, and child `folder2` |
| `folder-and-files` | Both | Child `folder2`, direct a note |
| `empty-folder` | Both | Zero-file summary; importing creates no notes or children |
| `html-alone` | Both | HTML wizard; one direct note |
| `md-then-html` | Drop | Markdown wizard first, HTML after its removal, two notes |
| `unsupported-only` | Drop | Notification names `skip.pdf`, no wizard or notes |
| `editor-drop` | Drop | Open a dedicated scratch note, drop in `.editor`, no wizard for 3 seconds |
| `note-list` | Drop | Drop a.md over `.note-list-bar`, one direct note |
| `cancel` | Both | Cancel Markdown and HTML separately; no notes |
| `oversized` | Neither | Explicitly skipped: the >`maxAttachmentFileSize` case is not covered |

The fixture tree is generated under gitignored `e2e/fixtures/`. Bodies contain
one random run marker plus a unique per-file suffix. `page2.htm` is generated
for follow-up coverage; the HTML scenario currently imports `page.html`.
No fixture includes image attachments.

The broader design's disabled-importer case and a real Finder-picker interaction
are not covered. Direct mode verifies exact picker-property restoration.

## Measured Inkdrop 6.2.0 behavior

These observations were made through the live renderer and local HTTP server on
2026-10-20. The earlier visibility/drag probes are in
[`../probes/results.md`](../probes/results.md).

- `POST /books` with `{"name":"E2E Drop Import"}` succeeds and returns
  `{"ok":true,"id":"book:…","rev":"…"}`. No renderer creation fallback was needed.
  Fetch documents using `/book:…` or `/note:…`; percent-encoding the colon
  produced HTTP 404 in this app.
- Markdown starts at `.modal-layout .import-markdown-wizard-dialog--stats`.
  Read its summary, click `Next`, select the notebook, then click `Import`.
- **HTML has no summary or Next step.** It starts directly at
  `.modal-layout .import-html-wizard-dialog--notebook` with
  “Please select a target notebook”, `Cancel`, and disabled `Import`.
  This was confirmed in both live DOM and the shipped
  `app.asar/packages/import-html/src/import-wizard-dialog.tsx`.
- NotebookListBar rows are
  `.notebook-list-bar .item[data-value="<book-id>"]`. Calling `row.click()`
  adds `active` to the selected row and enables `Import`. Both wizard types
  use this behavior. The harness selects by the newly created ID and confirms
  that exact row is active before clicking Import.
- Successful imports and Cancel remove their wizard root from `.modal-layout`;
  removal is the completion condition. An `.error.message` fails the import.
- An empty folder opens a Markdown summary stating
  “Going to import 0 Markdown files (0.0 KB total)”. Next and Import remain
  available, and completion creates neither notes nor child notebooks.
- Notifications render inside `.notification-bar .notification-item-view`;
  the message header is `.ui.message .header`, and the close control is
  `.close-button`. Clicking that control was verified to remove a temporary
  notification from the DOM. Items without a close control can remain rendered
  after `dismiss()`, and the notification view does not subscribe to the
  manager's clear event (shipped `notification-bar-Co6bqz1b.js`).
  When items remain, scenario preparation clears the notification manager,
  adds a temporary dismissable info item, and clicks the close controls.
  Closing that item refreshes the view from the cleared manager. Preparation
  waits for all notification items to disappear before continuing.
  Waiting for DOM removal also covers the dismissal animation, during which
  an item can still occlude a drop point.
  The unsupported-file check also requires a new notification timestamp, so an
  old `skip.pdf` message cannot satisfy it; the check requests dismissal
  afterward, and preparation removes any remaining item before the next case.
- Open a note with
  `inkdrop.commands.dispatch(document.body, 'core:open-note', { noteId, viewMode: 'edit' })`.
  The command registration exists in the live app; its payload is declared in
  `node_modules/@inkdropapp/types/src/commands.d.ts`.
  The harness waits for `inkdrop.store.getState().editingNote._id` and checks
  both the scratch ID and its `bookId` immediately before the editor drop.
  The native editor can show `.dialog-assistive-error` for a Markdown drop:
  “You can only insert image files.” and `text/markdown`. Scratch-note cleanup
  closes that exact error with its `Close` button and waits for DOM removal;
  other assistive errors are left untouched.
- Drop coordinates are computed from current region rectangles. The target
  must pass `document.elementFromPoint` containment checks. `.sidebar-menu`
  is the usual drop region; `.note-list-bar` and `.editor` are used only by
  their named cases. The editor drop uses the horizontal and vertical center
  of `.editor`; sidebar and note-list points remain near the top of their panes.

## Data isolation and cleanup

The harness refuses to reuse an existing `E2E Drop Import` notebook. It creates
one root and explicitly selects it in every wizard. The `editor-drop` case
creates and opens its scratch note in that same root, and refuses the drop
unless that exact scratch note remains active.

For each scenario, expected note bodies, titles, destinations, and complete
child-notebook paths are checked. Note documents and marker searches use HTTP;
the renderer's `findAllIdsInBook(..., { includeChildren: true })` provides the
complete scoped ID list, including notes outside the ordinary open-note list.
Cleanup rechecks each note's current notebook before removal, removes notes
with `inkdrop.localDB.notes.remove`, then removes children deepest-first with
`inkdrop.localDB.utils.deleteBook`. Cleanup enumeration also uses the renderer
database, so an HTTP-server outage alone does not prevent deletion.

Scenario cleanup and final root deletion run in `finally`, including assertion
failures. The final HTTP checks require no E2E root and zero search results for
the run marker and all ten file markers. Removal counts are printed.

If the app is terminated or its database becomes unavailable, cleanup cannot
complete through a disconnected renderer. The output includes the created
notebook ID for recovery; do not delete another notebook based on its name.
The harness reports cleanup errors and exits nonzero. A pre-existing open import
wizard also prevents a run, so the harness does not dismiss an owner's dialog.

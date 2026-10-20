# Task D3 delivery report

Task: `task_8855079ab9d5`; dispatch: `ctx_1cabf89cd3a7`.
Date: 2026-10-20. Scope: `e2e/` only, on `master`.
The complete historical D2 report is preserved below this section.

## Outcome and change

The final direct run passed 8 scenarios with 0 failures and exit 0; the final
drop run passed 12 scenarios with 0 failures and exit 0. Both runs verified no
E2E notebook and zero run/file marker matches after cleanup. Every drop case
also printed `picker restored` after checking that `showOpenDialog` is a
function with no own-property stand-in, as requested in coordinator addition
`msg_e25ca56f0b85`.

All bounded polling now uses the App helper. Each tick checks renderer
visibility and calls `inkdrop.window.show()` and `inkdrop.window.focus()` when
hidden, so React can finish pending UI updates. The separate timed no-wizard
observation loop uses the same recovery method. A per-scenario flag limits
`REFOCUS` logging to one line while still allowing repeated focus recovery.
Poll timeout errors query and include the current visibility state, or report
`unavailable` if the renderer cannot be queried.

The wait sweep covered wizard appearance/removal, buttons and notebook
selection, notification removal and arrival, import counts, marker searches,
scratch-note activation/closure, editor-error removal, and final cleanup
verification. No old standalone poll calls remain. The README includes the
requested two sentences explaining the visibility sensitivity and diagnostics.

## Focused live verification

A read-only database probe hid Inkdrop during an active poll twice, confirming
recovery and exactly one recovery log for that scenario. A subsequent negative
observation scenario recovered independently. A deliberately failing poll hid
the renderer before its deadline and reported the actual hidden state. The
window was shown again in the probe's finally block; no app relaunch occurred.

```text
REFOCUS visibility-recovery-probe — document.visibilityState=hidden; called show() and focus()
PASS visibility recovery — two mid-wait hides recovered; one REFOCUS line
REFOCUS negative-observation-probe — document.visibilityState=hidden; called show() and focus()
PASS negative observation — hidden renderer recovered; next scenario logs independently
REFOCUS timeout-visibility-probe — document.visibilityState=hidden; called show() and focus()
EXPECTED TIMEOUT Timed out waiting for forced visibility diagnostic (350 ms); document.visibilityState=hidden
PASS timeout diagnostic — reports current hidden state
```

The first probe assumed `hide()` changed visibility synchronously; correcting
the probe to wait for the actual visibility change resolved that test-only
assumption. An earlier drop attempt also found the app in distraction-free
layout with its drop panes absent and cleaned up successfully. The normal
layout was present again before final runs, and this worker applied no layout
toggle. These issues do not affect the final results below.

## Final source snapshot

```text
818b1571cae276d798389b7c3968d3d5f4542d3db891c3342f4af479a291551e  e2e/app.mjs
bfefd6357d9e4ee404b36e1419f0dbd6b61029a022c3c5b73c35ec5e348ca8fe  e2e/run.mjs
ad951710c4f9ac3268b93a1048ac646008115503cd4a2a358faa3697f5b16edd  e2e/README.md
```

The following command outputs are complete and unedited. The final code did
not change after these runs; subsequent edits updated only the plan and report.

## Direct mode

Command: `node e2e/run.mjs --mode direct`

```text
MODE direct; marker=dropimport4a0d30f8afa64669b04da38e09480d67
NOTEBOOK book:AC825mSE (E2E Drop Import)
PASS single-md — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; cleanup: 1 notes, 0 child notebooks
PASS md-and-txt — 3 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 3 files — no new notebookCancelNext; cleanup: 3 notes, 0 child notebooks
PASS single-folder — 3 notes; child notebooks: sub; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 2 files — no new notebook sub 1 fileCancelNext; cleanup: 3 notes, 1 child notebooks
PASS two-folders — 4 notes; child notebooks: folder1, folder1/sub, folder2; summary: Import Notes from MarkdownGoing to import 4 Markdown files (0.3 KB total): folder1 2 files sub 1 file folder2 1 fileCancelNext; cleanup: 4 notes, 3 child notebooks
PASS folder-and-files — 2 notes; child notebooks: folder2; summary: Import Notes from MarkdownGoing to import 2 Markdown files (0.1 KB total): 1 file — no new notebook folder2 1 fileCancelNext; cleanup: 2 notes, 1 child notebooks
PASS empty-folder — 0 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 0 Markdown files (0.0 KB total):CancelNext; cleanup: 0 notes, 0 child notebooks
PASS html-alone — 1 notes; child notebooks: none; summary: Import Notes from HTML — Please select a target notebook; cleanup: 1 notes, 0 child notebooks
SKIP md-then-html — drop mode only
SKIP unsupported-only — drop mode only
SKIP editor-drop — drop mode only
SKIP note-list — drop mode only
PASS cancel — Markdown and HTML Cancel removed dialogs; 0 notes; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; cleanup: 0 notes, 0 child notebooks
SKIP oversized — The >maxAttachmentFileSize case is not covered
CLEANUP removed 14 notes and 6 notebooks (including root)
VERIFY GET /books: no "E2E Drop Import"; GET /notes?keyword=<marker>: 0 for run marker and all 10 file markers
RESULT 8 passed, 0 failed, 5 skipped
```

Exit code: **0**.

## Drop mode

Command: `node e2e/run.mjs --mode drop`

```text
MODE drop; marker=dropimport0a1f3989597747d1849b232f6da6aabc
NOTEBOOK book:-8-8ZDuL (E2E Drop Import)
PASS single-md — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; picker restored; cleanup: 1 notes, 0 child notebooks
PASS md-and-txt — 3 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 3 files — no new notebookCancelNext; picker restored; cleanup: 3 notes, 0 child notebooks
PASS single-folder — 3 notes; child notebooks: sub; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 2 files — no new notebook sub 1 fileCancelNext; picker restored; cleanup: 3 notes, 1 child notebooks
PASS two-folders — 4 notes; child notebooks: folder1, folder1/sub, folder2; summary: Import Notes from MarkdownGoing to import 4 Markdown files (0.3 KB total): folder1 2 files sub 1 file folder2 1 fileCancelNext; picker restored; cleanup: 4 notes, 3 child notebooks
PASS folder-and-files — 2 notes; child notebooks: folder2; summary: Import Notes from MarkdownGoing to import 2 Markdown files (0.1 KB total): 1 file — no new notebook folder2 1 fileCancelNext; picker restored; cleanup: 2 notes, 1 child notebooks
PASS empty-folder — 0 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 0 Markdown files (0.0 KB total):CancelNext; picker restored; cleanup: 0 notes, 0 child notebooks
PASS html-alone — 1 notes; child notebooks: none; summary: Import Notes from HTML — Please select a target notebook; picker restored; cleanup: 1 notes, 0 child notebooks
PASS md-then-html — 2 notes; child notebooks: none; Markdown then HTML; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; picker restored; cleanup: 2 notes, 0 child notebooks
PASS unsupported-only — new notification names skip.pdf; no wizard for 3 s; 0 notes; picker restored; cleanup: 0 notes, 0 child notebooks
PASS editor-drop — scratch note verified active before drop; no wizard for 3 s; picker restored; cleanup: 1 notes, 0 child notebooks
PASS note-list — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; picker restored; cleanup: 1 notes, 0 child notebooks
PASS cancel — Markdown and HTML Cancel removed dialogs; 0 notes; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; picker restored; cleanup: 0 notes, 0 child notebooks
SKIP oversized — The >maxAttachmentFileSize case is not covered
CLEANUP removed 18 notes and 6 notebooks (including root)
VERIFY GET /books: no "E2E Drop Import"; GET /notes?keyword=<marker>: 0 for run marker and all 10 file markers
RESULT 12 passed, 0 failed, 1 skipped
```

Exit code: **0**.

## Static checks and limits

`node --check e2e/app.mjs`, `node --check e2e/run.mjs`, and
`git diff --check` passed. No dependencies or compile configuration changed.
The oversized-file case remains the explicit skip; existing D2 coverage limits
remain documented in README. No additional manual step is required.

---

# Task D2 delivery report

Task: `task_603e831038e0`; dispatch: `ctx_aa27a2510d82`.
Repository: `<repository root>`, branch `master`.
Date: 2026-10-20. Changed files are confined to `e2e/`.

## Outcome

Both complete suites passed on the final implementation, with the installed
plugin active and the local HTTP server restored:

| Mode | Passed | Failed | Skipped | Exit | Notes removed | Notebooks removed |
|---|---:|---:|---:|---:|---:|---:|
| direct | 8 | 0 | 5 | 0 | 14 | 6 |
| drop | 12 | 0 | 1 | 0 | 18 | 6 |

Both final HTTP checks found no E2E notebook and zero matches for the run marker
and all ten fixture markers. No acceptance blocker remains for Task D2.

## Cause and changes

The preceding unsupported-file case left a notification over the original
editor target. The live notification close control is `.close-button` under
`.notification-bar .notification-item-view`. The shipped renderer module
`app.asar/renderer/assets/notification-bar-Co6bqz1b.js` retains non-dismissable
items and does not subscribe to the notification manager's clear event; calling
`dismiss()` alone therefore did not remove the observed stale warning.

Before every scenario, the harness now clears the notification manager when
notification nodes are present, creates a temporary dismissable info item,
closes the available close controls, and polls until every notification node
is removed. Closing the temporary item refreshes the view from the cleared
manager. This uses supported notification methods and DOM clicks, without
removing React-owned nodes directly or changing the plugin.

The editor drop now uses the pane's horizontal and vertical center. The
`elementFromPoint` containment check and exact scratch-note/book-ID checks
remain enabled.

An adjacent isolation issue was also verified: the native editor may display
`.dialog-assistive-error` with “You can only insert image files.” and
`text/markdown` after the intentional editor drop. A leftover instance from the
earlier isolated test occluded all subsequent drop targets. It was closed,
and scratch-note cleanup now closes only that exact file-type error and waits
for its removal. The full drop run below passed editor-drop followed by
note-list, demonstrating that the overlay no longer leaks between scenarios.

No additional manual workflow step is required. As requested, scenario
preparation clears notifications already present in the app.

## Final source snapshot

SHA-256 values for the final source/documentation files:

```text
8b6d0e3a4716d77ef639251577d01c31e08a07e6e65b16bfe69632ed46e3624e  e2e/app.mjs
c1ce722aaf28c5241d8b2ffcc0ab70022ebe648469ab5b407441360805a29cfd  e2e/run.mjs
a1732339ede05af8fca4857ef8e8166470690fab897033685be43cb1f5ef89e4  e2e/README.md
```

The full unedited command outputs follow. Exit codes were captured from each
process separately and are stated beneath the output blocks.

## Direct mode

Command: `node e2e/run.mjs --mode direct`

```text
MODE direct; marker=dropimportf3bff809347d4907b7feb7f97e05c0c0
NOTEBOOK book:IoCtgFmf (E2E Drop Import)
PASS single-md — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; cleanup: 1 notes, 0 child notebooks
PASS md-and-txt — 3 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 3 files — no new notebookCancelNext; cleanup: 3 notes, 0 child notebooks
PASS single-folder — 3 notes; child notebooks: sub; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 2 files — no new notebook sub 1 fileCancelNext; cleanup: 3 notes, 1 child notebooks
PASS two-folders — 4 notes; child notebooks: folder1, folder1/sub, folder2; summary: Import Notes from MarkdownGoing to import 4 Markdown files (0.3 KB total): folder1 2 files sub 1 file folder2 1 fileCancelNext; cleanup: 4 notes, 3 child notebooks
PASS folder-and-files — 2 notes; child notebooks: folder2; summary: Import Notes from MarkdownGoing to import 2 Markdown files (0.1 KB total): 1 file — no new notebook folder2 1 fileCancelNext; cleanup: 2 notes, 1 child notebooks
PASS empty-folder — 0 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 0 Markdown files (0.0 KB total):CancelNext; cleanup: 0 notes, 0 child notebooks
PASS html-alone — 1 notes; child notebooks: none; summary: Import Notes from HTML — Please select a target notebook; cleanup: 1 notes, 0 child notebooks
SKIP md-then-html — drop mode only
SKIP unsupported-only — drop mode only
SKIP editor-drop — drop mode only
SKIP note-list — drop mode only
PASS cancel — Markdown and HTML Cancel removed dialogs; 0 notes; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; cleanup: 0 notes, 0 child notebooks
SKIP oversized — The >maxAttachmentFileSize case is not covered
CLEANUP removed 14 notes and 6 notebooks (including root)
VERIFY GET /books: no "E2E Drop Import"; GET /notes?keyword=<marker>: 0 for run marker and all 10 file markers
RESULT 8 passed, 0 failed, 5 skipped
```

Exit code: **0**.

## Drop mode

Command: `node e2e/run.mjs --mode drop`

```text
MODE drop; marker=dropimportdd06db1c480a423bab9911eec286d112
NOTEBOOK book:cAwRcZkE (E2E Drop Import)
PASS single-md — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; cleanup: 1 notes, 0 child notebooks
PASS md-and-txt — 3 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 3 files — no new notebookCancelNext; cleanup: 3 notes, 0 child notebooks
PASS single-folder — 3 notes; child notebooks: sub; summary: Import Notes from MarkdownGoing to import 3 Markdown files (0.2 KB total): 2 files — no new notebook sub 1 fileCancelNext; cleanup: 3 notes, 1 child notebooks
PASS two-folders — 4 notes; child notebooks: folder1, folder1/sub, folder2; summary: Import Notes from MarkdownGoing to import 4 Markdown files (0.3 KB total): folder1 2 files sub 1 file folder2 1 fileCancelNext; cleanup: 4 notes, 3 child notebooks
PASS folder-and-files — 2 notes; child notebooks: folder2; summary: Import Notes from MarkdownGoing to import 2 Markdown files (0.1 KB total): 1 file — no new notebook folder2 1 fileCancelNext; cleanup: 2 notes, 1 child notebooks
PASS empty-folder — 0 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 0 Markdown files (0.0 KB total):CancelNext; cleanup: 0 notes, 0 child notebooks
PASS html-alone — 1 notes; child notebooks: none; summary: Import Notes from HTML — Please select a target notebook; cleanup: 1 notes, 0 child notebooks
PASS md-then-html — 2 notes; child notebooks: none; Markdown then HTML; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; cleanup: 2 notes, 0 child notebooks
PASS unsupported-only — new notification names skip.pdf; no wizard for 3 s; 0 notes; cleanup: 0 notes, 0 child notebooks
PASS editor-drop — scratch note verified active before drop; no wizard for 3 s; cleanup: 1 notes, 0 child notebooks
PASS note-list — 1 notes; child notebooks: none; summary: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext; cleanup: 1 notes, 0 child notebooks
PASS cancel — Markdown and HTML Cancel removed dialogs; 0 notes; summaries: Import Notes from MarkdownGoing to import 1 Markdown file (0.1 KB total): 1 file — no new notebookCancelNext | Import Notes from HTML — Please select a target notebook; cleanup: 0 notes, 0 child notebooks
SKIP oversized — The >maxAttachmentFileSize case is not covered
CLEANUP removed 18 notes and 6 notebooks (including root)
VERIFY GET /books: no "E2E Drop Import"; GET /notes?keyword=<marker>: 0 for run marker and all 10 file markers
RESULT 12 passed, 0 failed, 1 skipped
```

Exit code: **0**.

## Other verification and coverage

- `node --check e2e/app.mjs` and `node --check e2e/run.mjs` passed.
- `git diff --check` passed.
- Live notification close-control and view-refresh probes passed.
- Live cleanup of the exact native editor file-type error passed.
- No dependencies or build configuration changed; these ES modules have no
  separate compile step.

The single drop-mode skip is the explicitly excluded oversized-file scenario.
Direct mode additionally skips the four drop-only scenarios. The generated
`page2.htm` fixture, disabled-importer behavior, and real Finder-picker
interaction remain outside this suite's coverage as documented in README.

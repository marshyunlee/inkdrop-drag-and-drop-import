# Task D implementation plan

## Task D3 follow-up

Origin: task `task_8855079ab9d5`, dispatch `ctx_1cabf89cd3a7`.
The coordinator reproduced a wizard-removal timeout after another window hid
Inkdrop during a scenario, although the import itself completed.

1. Move bounded polling into the app helper so every wait can check visibility,
   call show/focus when hidden, and include current visibility on timeout.
2. Apply the same visibility recovery to the timed no-wizard observation loop,
   and reset a single recovery-log flag at each scenario boundary.
3. Verify a hidden-window recovery and timeout diagnostics without database
   mutations, then run both full modes once on the final implementation.
4. Add the requested two README sentences and append final results/hashes to
   the report while retaining the D2 section; commit only e2e files.
5. Coordinator addition `msg_e25ca56f0b85`: assert after each drop scenario that
   showOpenDialog remains a function without an own-property stand-in, and
   include `picker restored` in successful scenario details.

Current follow-up status: complete. Live probes verified recovery from two
mid-wait hides with one log, independent logging for the next scenario, negative
observation recovery, and a timeout reporting the actual hidden state. Final
direct run passed 8/8 and drop passed 12/12, both exit 0 and VERIFY clean; all
drop cases reported picker restored. An earlier drop attempt encountered
distraction-free layout and cleaned up; the normal layout was present again
before final runs, without a toggle or relaunch by this worker.
Logging-state lifecycle: scenario name and log flag are initialized for setup,
reset from the runner's scenario name, and consumed only by visibility recovery
and console output. They are not serialized, persisted, or sent to Inkdrop.
All poll consumers share the app helper; the timed negative observation loop
uses the same visibility method.

## Task D2 follow-up

Origin: task `task_603e831038e0`, dispatch `ctx_aa27a2510d82`.
The coordinator restored HTTP and reproduced one full-suite failure: the
unsupported-file notification occluded the next scenario's editor drop point.

1. Confirm the live notification close control.
2. Dismiss notifications and wait for their DOM removal before each scenario.
3. Use the editor's vertical center while retaining containment and scratch-note guards.
4. Run both complete modes, preserve their full outputs, and verify cleanup.
5. Replace the blocked report with final results and source hashes; commit only e2e files.

Current follow-up status: complete. The final source passed both full modes:
direct 8 passed / 0 failed / 5 skipped, drop 12 passed / 0 failed / 1 skipped,
both exit 0. HTTP verification found no E2E notebook or fixture markers after
either run. Notification cleanup handles the notification view's retained
non-dismissable items, and scratch cleanup closes the exact native Markdown
file-type error. Full outputs and final source hashes are in `e2e/REPORT.md`.

## Original Task D record

Origin: live Task D dispatch `task_f4acb655776b`, dispatch `ctx_b97f94eb1906`.
Scope: dependency-free live Inkdrop harness; only `e2e/` files.

1. Read the supplied design, probes, local rules, and database types.
2. Reuse `../probes/cdp.mjs`; inspect the live wizard, HTTP book creation,
   notebook selection, notification DOM, and scratch-note opening.
3. Implement fixture creation, bounded DOM/API polling, direct/drop triggers,
   notebook-scoped assertions, and cleanup in scenario/run `finally` blocks.
4. Run all direct scenarios; repair failures using measured app behavior.
5. Run drop scenarios with the absent plugin; verify failure cleanup and record
   full output for both modes.
6. Document usage and measured selectors, commit only owned files on master,
   and deliver one durable report with the verified commit and remaining limits.

Safety: never reuse an existing notebook named `E2E Drop Import`; refuse that
collision. Track the created notebook ID and descendants, select it explicitly
before Import, and delete only its notes and notebooks. Do not dispatch editor
drops until a scratch note in that notebook is confirmed active.

Status at Task D handoff: implementation and README complete; direct mode passed all eight
scenarios and removed 14 notes plus six notebooks. An app relaunch interrupted
the plugin-absent drop baseline after three expected failures. The exact
interrupted-run root was recovered through the renderer (zero notes, one book
removed; no remaining markers). Final drop acceptance was blocked on local HTTP
server restoration by the coordinator/owner. CDP operations have explicit
timeouts and HTTP readiness fails before any notebook creation. Cleanup no
longer depends on HTTP: a live outage test removed two notes and three nested
notebooks with every HTTP call deliberately rejected, leaving zero residual IDs.
This historical block was resolved in Task D2 above.

Measured adjustments: HTML starts directly at notebook selection, without a
summary or Next button. An empty folder does open a zero-file Markdown summary.
POST /books accepts the supplied shape. Document IDs must retain the colon in
HTTP routes.

Lifecycle audit: fixture markers are produced with a random run ID, written to
gitignored files, conveyed through each wizard, fetched in note bodies, matched
through HTTP keyword searches, and checked absent after deletion. There is no
seed/default fallback. Notebook IDs are produced by POST, fetched for identity,
conveyed into picker selection and scratch-note creation, validated before
deletion, and logged for recovery. Markdown and HTML share destination checks,
note assertions, removal checks, and cleanup; HTML deliberately skips Next
because that step does not exist in the app.

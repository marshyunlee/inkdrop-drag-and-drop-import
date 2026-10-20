# Task A3 — closure review of A2

Reviewed snapshot: `323de03d594a751ad3a16bff646fd210941a3e3c`. Read-only production review; this report is the only file written by this worker. No Inkdrop interaction, installation, relaunch, or E2E execution occurred.

Independent checks: `npx tsc --noEmit` exited 0; `npm test` exited 0, **43 passed / 0 failed**. Additional isolated Node reproductions composed the actual `DropImportPlugin`, `dispatchImportSequence`, and `waitForWizardClose` with fake DOM/observer adapters and fake timers. All seven source-map `sourcesContent` entries match their current source files exactly, and the committed CJS module loads through `module?.default || module`.

## A2 closure table

| ID | status (verified fixed / not fixed / regressed) | evidence file:line |
|---|---|---|
| A2-1 | verified fixed | `src/types.ts:43` supplies `{ dismissable: true }`; warning/error sites use it at `src/dispatch-import.ts:50`, `:67`, `:79`, and busy info uses it at `src/index.ts:31`. The generic failure notification retains its explicit option at `src/index.ts:50`. Tests assert the option for unavailable importer (`src/dispatch-import.test.ts:82`), absent Markdown (`:124`), unsupported paths (`:149`), and busy info (`src/index.test.ts:62`). No nondismissable notification site remains. |
| A2-2 | verified fixed | `src/dispatch-import.ts:90–91` now waits on the HTML selector after successful dispatch; `src/index.ts:36–46` keeps the guard set while that wait is pending. `src/dispatch-import.test.ts:86–112` proves the mixed sequence remains pending until HTML closes. An additional composed-plugin reproduction showed an HTML wizard, attempted a second drop, and verified one command only, one dismissable busy notification, a still-pending sequence after 60 seconds, and completion/cleanup on removal. This closes the original ordinary second-drop reproduction; the post-timeout exception is tracked under A2-3 below. |
| A2-3 | not fixed | **Partially repaired:** `src/wait-for-wizard-close.ts:50–54` pauses the appearance deadline while hidden; `src/dispatch-import.ts:77–86` warns and stops on absent Markdown, so it no longer automatically dispatches HTML before a late Markdown wizard. **Remaining part:** `src/wait-for-wizard-close.ts:38–43` disconnects after timeout, and `src/index.ts:45–46` clears the guard. A later first-wizard appearance does not reinstate it, and entry at `src/index.ts:30` does not check the DOM. The composed-plugin reproduction below accepted a new Markdown command while the late first Markdown wizard was already open. The warning does not prevent the resulting replacement of its pending selection. |

## Remaining and new findings

| ID | file:line | severity | reproduction (inputs → wrong outcome) | evidence |
|---|---|---|---|---|
| A2-3 residual | `src/wait-for-wizard-close.ts:38`, `src/index.ts:30`, `src/index.ts:45` | major | Drop `first.md` with or without HTML; no Markdown DOM appears during the five-second visible-window deadline; receive the new warning; the original built-in wizard then appears late; drop `second.md` onto a non-editor part of the open wizard → another Markdown command is accepted and the singleton wizard's pending selection can be replaced. | Isolated execution of the real lifecycle, sequence, and wait: after `tick(5000)`, the first sequence settled and warned, with only one command (HTML correctly skipped). Adding the late Markdown node and making another drop immediately raised the command count to two; the busy branch did not run. The existing A2 archive-source evidence establishes that a new Markdown invocation executes `setFilePaths(pickedPaths)` on the same component (`/Applications/Inkdrop.app/Contents/Resources/app.asar/packages/import-markdown/src/index.tsx:49–61`). **Limit:** the greater-than-five-seconds *visible-window* rendering delay was simulated, not reproduced live; hidden-window delay alone is now correctly handled. |
| A3-1 | `src/dispatch-import.ts:91` | minor | Drop only `page.html`, or close the Markdown step of a mixed drop; the HTML picker is requested successfully but no HTML wizard appears during five visible seconds → the sequence ends silently and releases the guard, with no absent-dialog warning or fallback guidance. | The Markdown branch consumes the new outcome at `src/dispatch-import.ts:77–86`, but the HTML branch discards it at `:91`. A composed-plugin reproduction advanced the actual HTML wait to its timeout and verified zero notifications, zero remaining observers/listeners, and acceptance of the next drop. This contradicts the documented per-dialog timeout-and-warning behavior (`docs/design.md:124`, `docs/development.md:10`). `src/dispatch-import.test.ts:165–169` uses an immediately `closed` waiter and never exercises absent HTML. |

## Is releasing the guard after `absent` acceptable?

A bounded timeout is an acceptable way to stop automatic sequencing and avoid an indefinite busy state when no wizard exists. The current Markdown warning correctly tells the user that HTML was skipped. However, `absent` means only “not observed before the deadline”; the plugin has not canceled the already-dispatched importer. The original request can still produce a wizard after the wait resolves.

Releasing the guard is therefore not proof that later drops are safe. Once the late wizard is visibly open, the plugin should refuse another drop instead of replacing its selection. The warning does not preserve that selection and does not warn that a later drop will overwrite it. A current-wizard check before dispatch is a small way to address the reproduced late-*already-open* case; this finding does not demand an infinite wait, a larger timeout, or an elaborate cancellation system. A second drop made before any late wizard appears has a separate unresolved race with the original importer and is not claimed to be solved by that check.

This distinction is why A2-3 remains open despite the successful fixes to automatic HTML progression and hidden-window time accounting. No claim is made that a late wizard imports data automatically: the verified defect is acceptance of a new command into the pending singleton workflow.

## Does the HTML wait introduce a new stuck state?

No new stuck state was demonstrated under the measured wizard-removal contract.

- Once HTML is observed, its timer is canceled and the sequence intentionally remains pending until removal. The composed-plugin check stayed pending after 60 seconds, refused a second drop, then completed and removed all observer/visibility listeners after removal.
- An HTML wizard that never appears while visible releases the wait after five seconds. Its missing warning is A3-1, not a stuck wait.
- A hidden window can keep an unobserved HTML wait pending indefinitely. This is the deliberate visibility policy: returning to visible starts a fresh five-second deadline. The composed check verified this transition and cleanup after the deadline.
- Deactivation before HTML appearance and after HTML appearance, including while hidden, aborted the actual wait and cleaned up the observer and visibility listener in both cases. The shared lifecycle signal is correctly wired through `src/index.ts:40–43`.
- Removing the entire observed parent instead of removing the wizard from that parent can still strand the narrowed observer (`src/wait-for-wizard-close.ts:65`). This was already a conditional A2 observation, and no real Inkdrop path producing that layout replacement while this plugin remains active was established. It is not promoted to a new verified defect here.

## Outcome lifecycle and sibling parity

The new outcome is produced by the wait (`src/wait-for-wizard-close.ts:30`, `:43`, `:47`, `:53`, `:68`), conveyed through `ImportOptions.waitForWizardClose` (`src/dispatch-import.ts:15`) and the lifecycle wrapper (`src/index.ts:40`), and consumed by the Markdown branch (`src/dispatch-import.ts:77–86`). Its sibling HTML branch awaits but does not consume it (`:91`): A3-1. The outcome is transient; serialization, persistence, fetching, and seed/default restoration do not participate. The test fixture defaults it to `closed` (`src/dispatch-import.test.ts:27`); this is why the HTML absence gap passes the suite. Display participates through the Markdown absence warning only. No outcome-specific logging or summary exists.

## Coordinator E2E evidence

The task brief reported direct **8 passed / 0 failed**, and the main drop run **11 passed / 1 failed**, with the failure occurring before a drop because `.note-list-bar` was absent. Coordinator follow-up `msg_a0abaf5944a0` (Orca dispatch `ctx_4e75615b56fd`, received and acknowledged during this review) reports that the isolated note-list scenario passed after showing the list with `core:note-list-show-all-notes`, importing one note with picker restoration and cleanup verified. This gives **12/12 drop scenarios across the main run plus isolated rerun**, and **8/8 direct scenarios**. These are coordinator-reported live results, not independently rerun evidence. Neither timeout finding is contradicted by those normal-rendering scenarios passing.

Before delivery, HEAD advanced to `364810a0cdc319e5f7195f24157e62d48d5bea01` to add the E2E evidence and note-list harness setup. `git diff 323de03 HEAD -- src lib docs/design.md docs/development.md` was empty, and all digests below remained unchanged. The committed logs `docs/evidence/coordinator-e2e-323de03-direct.txt:18` and `docs/evidence/coordinator-e2e-323de03-drop.txt:20` confirm the original 8/0 and 11/1 runs respectively; the isolated note-list success is attributed to the coordinator message above.

## Snapshot digests

| File | SHA-256 |
|---|---|
| `src/index.ts` | `9036a11e35ca48e90ce7b95d36c29de7cafba2bf5416fcedc4ea988c3a0abacf` |
| `src/dispatch-import.ts` | `b06f73c13566580a1662e5b421dbe281d81f1a68516d6f0cb55ef98dfe313912` |
| `src/wait-for-wizard-close.ts` | `4598b657611f7a7a805b7517b9b3fc1c0fea0623e8b537f66d7fbd0175ab44cb` |
| `src/types.ts` | `754721d93f3f865ba8f2ed144db27962dddcc3071f45c323c589f0101862e1da` |
| `lib/index.js` | `0a55755ef03daef7252b68a48dc30e8503b2c104c655c3e87e9f3f7f7bcf3a4c` |

VERDICT: CHANGES NEEDED

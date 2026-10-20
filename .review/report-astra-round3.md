# Task A4 — closure review

Reviewed implementation: `bf92dbc5a0f5cc4c868137356a89a928da25f8ed`. HEAD `be99184cf1179ba29cc184f16a471dafb7f377c4` adds evidence only; source and bundle match the implementation commit. Only this report was written by this worker. No Inkdrop interaction, install, relaunch, or E2E execution occurred.

## Closure status

| ID | status (verified fixed / not fixed / regressed) | evidence file:line |
|---|---|---|
| A2-3 residual | verified fixed | `src/types.ts:39` combines both wizard selectors; the default check at `src/index.ts:13–14` queries that selector; the default dependency wiring at `src/index.ts:24` and refusal at `src/index.ts:38–40` protect a wizard present after the original sequence has timed out. `src/index.test.ts:55–65` verifies refusal without an in-flight sequence and acceptance after closure. Additional isolated execution of the committed bundle's **default wiring** reproduced the original timeout → late wizard → second drop sequence for both Markdown and HTML: the command count remained one, and the second drop produced a dismissable busy notification. Removing the wizard restored acceptance. The same check passed for manually opened Markdown and HTML wizards. |
| A3-1 | verified fixed | `src/dispatch-import.ts:91–97` consumes the HTML wait result and sends one dismissable warning only for `absent`. `src/dispatch-import.test.ts:165–173` asserts the HTML command, warning count/message, and notification option. Additional bundle-level reproductions confirmed the warning for HTML-only drops and for HTML after a closed Markdown wizard, using the real five-second wait with fake timers. An aborted HTML wait emitted no warning. |

## New findings

None. No new defect or regression was demonstrated in the changed paths.

The DOM check does not retain a separate busy state: once the wizard is removed and no sequence is in flight, another drop is accepted. The HTML outcome branch distinguishes absence from abortion, preserves the existing close behavior, and adds no extra wait. Both absence and deactivation cleaned up the observer and visibility listener in the isolated checks; the native picker descriptor was restored in every checked sequence.

The two explicitly accepted limitations remain outside this closure verdict: a second drop before any late wizard appears can still race the original importer, and replacing the entire observed modal parent can strand the narrowed observer. No new evidence for either limitation was found.

## Verification

- `npx tsc --noEmit`: exit 0.
- `npm test`: exit 0; **45 passed, 0 failed**.
- Six additional isolated bundle checks passed: late Markdown wizard, late HTML wizard, manually opened Markdown wizard, manually opened HTML wizard, absent HTML after Markdown, and aborted HTML. The late-HTML check also verified the HTML-only absence warning before the delayed node appeared. The checks used fake DOM/observer adapters and fake timers; they did not connect to Inkdrop or write notes.
- All seven `lib/index.js.map` source-content entries exactly match current source. The committed CJS bundle loaded using `exports.default || exports`; the checks exercised its default listener, path resolver, classifier, DOM predicate, dispatch sequence, and wizard wait rather than replacing the new predicate with a boolean stub.
- The new dependency is declared at `src/index.ts:10`, provided by the default constructor at `:24`, consumed at `:38`, and injected in tests at `src/index.test.ts:38`. The selector is derived from the two existing sibling selectors at `src/types.ts:36–39`. These values are runtime-only; no serialization, persistence, fetching, or seed migration participates. Both Markdown and HTML absence outcomes now reach notification handling with the same dismissable option.
- Documentation reflects the DOM check at `docs/design.md:124` and `docs/development.md:10`.

Coordinator-run live evidence, read but not rerun by this worker:

| Evidence | Result |
|---|---|
| `docs/evidence/coordinator-e2e-bf92dbc-direct.txt:18` | 8 passed, 0 failed, 5 skipped |
| `docs/evidence/coordinator-e2e-bf92dbc-drop.txt:18` | 12 passed, 0 failed, 1 skipped |
| Both evidence files, lines 16–17 | Cleanup completed and zero matching test notes/notebooks remained |
| Drop evidence, lines 3–14 | All 12 passing cases include picker restoration |

## Snapshot digests

| File | SHA-256 |
|---|---|
| `src/index.ts` | `787abecd3da14ae8c957c453baa6df77f0506472df694c48e39f352411ff2795` |
| `src/dispatch-import.ts` | `00480696955097f8a8e8bdf03c13b0afa73f671e8a900b60267ecd57a3ba625b` |
| `src/types.ts` | `07e057d3ce3611a277c097276620bf254fa20100f79b7c5c551dbe2d66aa9f4e` |
| `lib/index.js` | `3c252e037dbe2cdddd51e214588db592d1196ebb51684905abf3008d80e7e452` |

VERDICT: ALIGNED

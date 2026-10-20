# Review round 2 — drop-import plugin, Task R2

Reviewed snapshot: `bd3a599` (round-1 fixes) against round-1 baseline `6f421d4`. HEAD moved to `80da3375` during the review. That commit only adds `docs/evidence/README.md`; `src/` is identical to bd3a599.
Read-only review. `npx tsc --noEmit` exited 0. `npm test` ran 39 tests: 39 pass, 0 fail (Node v26.10.0).

E2E on bd3a599 (run by the coordinator; message "E2E results for bd3a599", and local `docs/evidence/coordinator-e2e-bd3a599-{direct,drop}.log`):

| Mode | Result | Cleanup | Verify |
|---|---|---|---|
| direct | 8 passed, 0 failed, 5 skipped | removed 14 notes, 6 notebooks | no E2E notebook; 0 matches for the run marker and all 10 file markers |
| drop | 12 passed, 0 failed, 1 skipped | removed 18 notes, 6 notebooks | same |

The drop log has 12 `PASS` lines, and all 12 carry `picker restored`.

## Round-1 items

| ID | status | evidence file:line |
|---|---|---|
| M1 | verified fixed | src/types.ts:1 now starts with the `DroppedItemKind` doc comment; the coordinator/worker lines are gone |
| M2 | verified fixed | `HTML_WIZARD_SELECTOR` is absent from src/types.ts:35-38 and from `src/` (grep) |
| M3 | verified fixed | src/resolve-dropped-paths.ts:8-15 splits drops into `paths` and `virtualFileNames`. src/drop-listener.ts:36 appends the names to `unsupported`, and src/dispatch-import.ts:52-55 names them in the one notification. Tests: src/resolve-dropped-paths.test.ts:31-34, :42-45; src/drop-listener.test.ts:120-132. Residue: N1 |
| M4 | verified fixed | docs/design.md:5 (status line), :118-119 (file list), :122 (`.editor` + probes §4), :141 (§8.4 result). Residue: N3 |
| M5 | verified fixed | README.md:27 now says Node.js 26, matching e2e/README.md:3 and the run environment |
| T1 | verified fixed | src/index.test.ts:38-48: activating twice gives 2 attaches and 1 dispose; deactivate gives 2 disposes and an aborted signal. src/index.ts:6-17 adds the dependency object. `waitForWizardClose` gets the same `abortController.signal` by closure (src/index.ts:37-40), checked by inspection, not by a test |
| T2 | verified fixed | src/drop-listener.test.ts:134-144 (synchronous throw: reported once, 0 imports) and :146-155 (async rejection: reported once) |
| T3 | verified fixed | e2e/run.mjs:132-140 checks for no own `showOpenDialog` and `typeof` `function` after every drop scenario. Confirmed live: 12/12 drop `PASS` lines say `picker restored` |
| T4 | verified fixed | src/classify-paths.test.ts:61-71 pins classification by the dropped path's extension (`/drop/notes` → unsupported, `/drop/x.md` → markdown) |
| T5 | verified fixed | README.md:5 says verified in edit mode, inferred for preview and side-by-side |
| O1 | verified fixed | src/wait-for-wizard-close.ts:1, :50 (`WIZARD_APPEARANCE_TIMEOUT_MS`) |
| O2 | verified fixed (partial, see N2) | src/index.ts:26-44 refuses a drop while a sequence is running, with one `addInfo`. Test: src/index.test.ts:51-68 |
| O3 | rejected by the coordinator; accepted | Theoretical. The stand-in lives for one synchronous dispatch (src/dispatch-import.ts:23-39) |
| O4 | rejected by the coordinator; accepted | The behavioral assertions remain (src/wait-for-wizard-close.test.ts:45, :53, :56-57) |

**Bundle-shape check (no finding):** `export class DropImportPlugin` made the CJS bundle emit `exports.DropImportPlugin` and `exports.default` instead of `module.exports = instance`. Local `lib/index.js:260-261` is an untracked build, so the line numbers are only indicative. Inkdrop 6.2.0's package loader does `this.mainModule = t?.default || t` (shipped `/Applications/Inkdrop.app/Contents/Resources/app.asar`, package loader), so the default export loads. The live drop-mode pass (12/0/1) confirms it.

## New findings

| ID | file:line | severity | rule or requirement | evidence | consequence |
|---|---|---|---|---|---|
| N1 | src/types.ts:9 | minor | ~/AGENTS.md review convention (mandatory): "Sweep every reference to the old behavior — stale comments … in the same change" | The doc comment says `unsupported` holds "Absolute paths of everything else". Since M3, src/drop-listener.ts:36 also pushes bare names (`pasted.png`) into the same array | The contract comment now states something false. A future consumer that trusts it (e.g. `fs.stat` or `path.resolve` on `unsupported`) would mishandle virtual names. Fix: one line, e.g. "Absolute paths of everything else, including paths that no longer exist, plus the names of dropped items with no filesystem path." |
| N2 | src/index.ts:26-44; src/dispatch-import.ts:65-67 | minor | O2 fix scope; README/code consistency | The in-flight flag only covers the period while `dispatchImportSequence` runs. HTML dispatch is not awaited, so the flag clears as soon as the HTML wizard opens, and an HTML-only drop clears it immediately. README.md does not mention the "an import is already in progress" refusal (grep) | Drops are refused while the Markdown wizard is open, but accepted while an HTML wizard is open. Inkdrop's behavior with an HTML wizard plus a new import is unmeasured. The refusal is a user-visible behavior with no documentation. Fix: document the refusal and its scope in README. Extending the guard to the HTML wizard is optional |
| N3 | docs/design.md:123 | minor (opinion) | design/code consistency | Says the observer waits for the dialog "to go from visible to gone or hidden". src/wait-for-wizard-close.ts:41-44 handles removal only, which matches probes/results.md §5 | Doc residue only. The code follows the measured behavior. Needs owner sign-off to edit the accepted design |
| N4 | .gitignore:3; docs/evidence/README.md:12 | minor | acceptance criterion 4 (evidence) | The evidence README points to `coordinator-e2e-bd3a599-{direct,drop}.log`, but `*.log` is ignored (`git check-ignore` → .gitignore:3), and `git ls-files docs/evidence` lists only README.md | The full E2E outputs exist only on this machine; the committed evidence is the 2-line summary. Fix: commit the logs (`git add -f`), or rename them, e.g. `.txt` |

## Assessment

Every round-1 item that was applied is verified at bd3a599. Both E2E modes pass on that commit with full cleanup, and drop mode now checks picker restoration live. The two rejections are accepted. None of the four new findings is a correctness or behavior defect in the plugin.

N1 is a stale contract comment introduced by the M3 change. It breaks the mandatory sweep rule, the same class of rule-only violation that set the round-1 verdict, so it alone keeps this from ALIGNED; the fix is one line in src/types.ts:9. N2 and N4 are recommended. N3 is the owner's call.

VERDICT: CHANGES NEEDED

# Review — drop-import plugin, Task R

Reviewed snapshot: `6f421d4e5923239983782b4bf8da83fb29980449` (master HEAD, working tree clean).
Read-only review. Ran only `npx tsc --noEmit` (exit 0) and `npm test` (33 tests, 33 pass, 0 fail, Node v26.10.0).
I did not run, install, or relaunch anything against Inkdrop. Live-behavior claims rely on `probes/results.md` and `e2e/REPORT.md`.
During the review, another process modified `e2e/PLAN.md`, `e2e/README.md`, `e2e/app.mjs` and `e2e/run.mjs` in the working tree; `src/` was not changed. Every `e2e/` citation below was re-checked against `git show 6f421d4:<path>` and refers to the commit, not to those later edits. T3 in particular should be re-checked against the uncommitted `e2e/app.mjs`.

## Summary

The plugin core matches the binding design sections.

- **§4 stand-in:** `dispatch-import.ts:20-39` installs the stand-in as an own property with `defineProperty`. `finally` restores the original descriptor, or deletes the own property when the method was inherited. This covers success, a throw, and an importer that never calls the picker.
- **Importer not called:** a picker that was never requested raises one error and stops before the wait and before HTML (`:41-44`, `:61`).
- **Order and folder command:** Markdown runs first, then the wait, then HTML (`:57-67`). Folder-only drops use `import-from-directory` (`:58-60`).
- **§5/§6 drop listener:** both listeners use the capture phase on `window` (`drop-listener.ts:42-43`). The editor is excluded by `.editor` (`:23`, `types.ts:36`), which matches probes §4: in preview mode `.cm-editor` is 0×0, so `.editor` is the correct choice. Drags without files are ignored (`:25`), and dispose removes both listeners (`:44-47`).
- **Wizard wait vs probes §5:** the wait resolves on DOM removal (`wait-for-wizard-close.ts:41-42`). A 5 s bound applies only until the wizard appears, and is cleared once it does (`:37`, `:48`). Abort resolves the wait and disconnects the observer (`:25-29`, `:46`). The observer disconnects on every exit path, so no observer is left running.
- **Lifecycle:** `index.ts:11` makes a second `activate` idempotent. `deactivate` aborts the shared signal, and `dispatch-import.ts:64` then skips the HTML step.
- **Classification:** `classify-paths.ts` matches §2 and the `types.ts` contract (case-insensitive extensions, directories go to Markdown, missing or special paths are unsupported, `isFolderOnly` is computed over Markdown items only).
- **Bundle:** the build emits `module.exports = src_default` (`lib/index.js:229`, local untracked build), which matches the default export.

There are no blockers or majors. One finding breaks a mandatory acceptance rule (criterion 3, situational comment, M1); it is a two-line deletion. Everything else is minor or opinion.

## Findings

| ID | file:line | severity | rule or requirement | evidence | consequence |
|---|---|---|---|---|---|
| M1 | src/types.ts:1-2 | minor | ~/AGENTS.md "No unnecessary comments … comment about the code, not the situation" (acceptance criterion 3) | `// Owned by the coordinator; workers implement against it and do not change it.` describes the multi-agent build process, not the code | Process jargon stays in shipped source after the coordinator/worker setup is gone. Fix: delete lines 1-2 (line 1 on its own adds nothing either) |
| M2 | src/types.ts:33-34 | minor | ~/AGENTS.md "Do not … overengineer"; avoid dead surface | `HTML_WIZARD_SELECTOR` is exported but has no consumer anywhere in `src/`, `e2e/` or `probes/` (grep); tree-shaken out of `lib/index.js` | Dead export. Its comment implies a behavior (waiting on the HTML wizard) that the code does not have. Remove it, or keep it only if a consumer is planned |
| M3 | src/resolve-dropped-paths.ts:5, src/drop-listener.ts:27-36 | minor | design §1 "Unsupported items … One notification names them" | Files with no backing path (`getPathForFile` → `''`, e.g. a browser image drag or a file promise) are filtered out before classification. `dragover` still shows the "copy" cursor (`drop-listener.ts:30`), and the drop produces no dialog and no notification | A drag that the plugin accepted visually ends with no feedback. When every item is virtual, nothing happens at all. Fix: pass the names of empty-path files to the unsupported notification |
| M4 | docs/design.md:5, :118, :121 | minor | design is the binding doc; README links into it | `:121` still says the exclusion is `.cm-editor` (the code uses `.editor` per probes §4). `:118` puts the wizard wait in `dispatch-import.ts` (it lives in `wait-for-wizard-close.ts`). `:5` says "Status: design, not implemented" | A reader following README → design gets the selector that probes §4 shows is wrong. Needs owner sign-off to edit the accepted design. The code is correct |
| M5 | README.md:27 vs e2e/README.md:3 | minor | README/code consistency | Root README says "Node.js 24 or later" for unit tests; e2e README says "Node 26". Everything was verified only on v26.10.0 | Unverified minimum version. Either test on 24 or state 26 |
| T1 | src/index.ts:10-38 | minor | review checklist: lifecycle (activate twice, deactivate in flight) | No unit test covers `index.ts`. Abort is tested in isolation (`dispatch-import.test.ts:139`, `wait-for-wizard-close.test.ts:83`). The wiring that hands the same `signal` to both the sequence and the wait (`index.ts:19-22`) has no test. E2E never deactivates mid-sequence | A regression in the wiring (e.g. a new controller per drop, or a missing `this.deactivate()` on activate) passes every test |
| T2 | src/drop-listener.test.ts:53 | minor | review checklist: "errors reported once" | The fixture's `reportError` rethrows, and neither the synchronous resolve/classify throw (`drop-listener.ts:37-38`) nor the async rejection (`:36`) is exercised | Error reporting can be removed or duplicated with no failing test |
| T3 | e2e/app.mjs:182-186 | minor | design §9 "after each case, File → Import … still shows the real Finder picker" | Drop mode returns right after the CDP drop and never checks `Object.hasOwn(inkdrop.dialog,'showOpenDialog') === false`. The restoration check at `app.mjs:205` covers the harness's own copy of the stand-in, not the plugin's. Plugin restoration is covered only by units (`dispatch-import.test.ts:33-66`) | No live evidence that the plugin's stand-in never outlives a dispatch in the real app. Fix: add one live property check after each drop scenario |
| T4 | src/classify-paths.test.ts:45-51; src/classify-paths.ts:27 | minor | design §9 unit: "a symlink" | The symlink case is a stub returning `directory`. No file symlink is tested. Code classifies by the link name's extension (`extname(path)`), not the target's | Untested edge: `notes` → `a.md` is rejected as unsupported, and `x.md` → `a.pdf` is sent to the Markdown dialog. Behavior is plausible, but neither the design nor the tests pin it |
| T5 | README.md:5; e2e/README.md:117-118 | minor | design §8.4 "including in side-by-side preview mode" | README claims the exclusion covers the editor's preview area. The E2E `editor-drop` opens the note with `viewMode: 'edit'` only. Probes §4 measured preview-mode classes but made no drop there | The preview/side-by-side exclusion is inferred from the selector, not observed |
| O1 | src/wait-for-wizard-close.ts:48 | minor (opinion) | ~/AGENTS.md naming (recommended) | `setTimeout(finishWaiting, 5000)` uses an unnamed literal | A name such as `WIZARD_APPEARANCE_TIMEOUT_MS` would make the bound's meaning searchable. Cosmetic |
| O2 | src/index.ts:15 | minor (opinion) | robustness; not in design | Drops are not serialized. A file dropped onto an already open import modal (outside `.editor`) starts a second sequence and dispatches another import command while a wizard is open. Inkdrop's behavior with two wizards is unmeasured. A second dispatch that skips the picker would raise the misleading "disabled or missing" error (`dispatch-import.ts:42`) | Possible stacked dialogs or a misleading error. Unverified: no probe covers it |
| O3 | src/dispatch-import.ts:23-32 | minor (opinion) | design §4 "nothing else can observe it" | The stand-in is visible to every listener that runs synchronously inside `commands.dispatch`, including another plugin's listener on the same command name. Such a listener also sets `isPickerRequested` | Theoretical; no such listener is known in 6.2.0 |
| O4 | src/wait-for-wizard-close.test.ts:40-50 | minor (opinion) | test quality | Asserts exact observe targets and options (`body` subtree, then `parent` childList), which are implementation details. The behavioral assertions (resolution timing, disconnect) are present and sufficient | These tests break on a correct refactor (e.g. observing `.modal-layout` directly) |

## §9 coverage matrix

| §9 case | Unit | E2E (drop mode unless noted) |
|---|---|---|
| classify: every extension, upper/lower case | classify-paths.test.ts:20-42 | — |
| classify: folders, missing path | :44-59, :61-86 | — |
| classify: symlink | stub only (T4) | — |
| one `.md` | — | single-md |
| several `.md` + `.txt` | — | md-and-txt |
| one folder / two folders / folder + files | dispatch-import.test.ts:103 (command) | single-folder, two-folders, folder-and-files |
| `.html` alone | dispatch-import.test.ts:132 | html-alone (`.htm` only via unit) |
| `.md` + `.html` in order | dispatch-import.test.ts:81 | md-then-html |
| `.pdf` alone | dispatch-import.test.ts:111 | unsupported-only |
| drop on editor | drop-listener.test.ts:66-69 | editor-drop (edit mode only, T5) |
| Cancel in each dialog | — | cancel (separately; the Cancel-then-HTML path follows from removal = close, probes §5) |
| importer disabled | dispatch-import.test.ts:68 | not covered (documented, e2e/README.md:72) |
| real picker still works afterward | dispatch-import.test.ts:33-66 | not for plugin code (T3) |
| oversized | — | known skip |

## Notes (no action)

- The `MODULE_TYPELESS_PACKAGE_JSON` warnings in `npm test` are noise. Do **not** silence them with `"type": "module"`: `main` is the CJS build `lib/index.js`, and that field would make Electron load it as ESM.
- Direct E2E mode deliberately reimplements the stand-in (`e2e/app.mjs:192-205`) to exercise the importers without the plugin. Only drop mode exercises plugin code, and it passed 12/0/1 with exit 0 (`e2e/REPORT.md:95-116`).
- The install, uninstall and relaunch scripts match their README descriptions (`README.md:37-53`).

## Required for ALIGNED

Fix M1, the only acceptance-rule violation. M2–M5 and T1–T5 are recommended. O1–O4 are opinions.

VERDICT: CHANGES NEEDED

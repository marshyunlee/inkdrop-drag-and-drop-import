# Task A2 — bug review

Reviewed commit: `13c5d0ed5eda8cecd50e141eca700f4b93052292` (master HEAD). Source and committed bundle were unchanged during review. This report is the only file written by this worker.

Scope: plugin correctness and unit-test assertions, using `docs/design.md`, `probes/results.md`, `docs/development.md`, all three previous reviews, current source/tests/bundle, and read-only inspection of the installed Inkdrop archive. No install, relaunch, live app interaction, database access, or E2E execution occurred.

Validation: `npx tsc --noEmit` exited 0; `npm test` exited 0 with **39 passed, 0 failed**. Additional Node processes exercised the actual source and committed bundle with isolated adapters and fake timers. Inkdrop's actual notification class and HTML component were read from its archive and executed with dependency adapters, without connecting to Inkdrop. One initial HTML adapter assertion ran before the VM's cross-realm promise continuation; after waiting one event-loop turn, the reproduction passed. This was a reproduction-harness timing issue, not a product failure.

## Findings

| ID | file:line | severity (blocker/major/minor) | reproduction (inputs → wrong outcome) | evidence |
|---|---|---|---|---|
| A2-1 | `src/dispatch-import.ts:58`, `src/dispatch-import.ts:45`, `src/index.ts:30` | major | Drop an unsupported file, drop a supported file while its importer is disabled, or drop again while Markdown is open → a notification with no close control remains onscreen after its timeout and after clicks. Repeating these inputs accumulates notifications over the editor; a large unsupported selection produces a particularly large permanent notification. | All three calls omit notification options. Inkdrop's actual `Notification.isDismissable()` returns `!!options.dismissable`; `dismiss()` does nothing when false. Its renderer retains `!isDismissed() || !isDismissable()` and supplies the close callback/control only for dismissable items. Isolated execution of the archive's notification class with the plugin's real warning/error calls verified both were still renderable after `dismiss()`. The same omission exists in the busy-import info path. Historical live evidence already records a plugin warning occluding later targets and requiring a special clear-and-refresh workaround: `e2e/REPORT.md:151`, `e2e/app.mjs:144`. Existing unit tests assert notification text/count, not options or dismissal. |
| A2-2 | `src/dispatch-import.ts:70`, `src/index.ts:44` | major | Drop `first.html`; leave its notebook-selection wizard open; drop `second.html` onto that wizard or another non-editor target → the second drop is accepted, the singleton HTML wizard now holds only `second.html`, and `first.html` silently disappears from the pending selection. A selected notebook is also reset. This also happens after the HTML step of a mixed drop. | HTML dispatch has no wait; `dispatchImportSequence` resolves and the `finally` clears the guard. The installed HTML component's `startWizard` replaces `filePaths`, resets `selectedBookId`, and calls `show()` on the same modal (`app.asar/packages/import-html/src/index.tsx:54–65`). An isolated execution of that exact component plus the real plugin and sequence produced `wizardFilesAfterTwoDrops: ["/drop/second.html"]`, with no rejection. Current `README.md:39` explicitly promises refusal while a drop-opened dialog remains open. This revisits round-2 N2 with **new evidence**: a demonstrated replacement of the pending import, rather than the previous unmeasured possibility of stacked dialogs; the current README also no longer states the accepted HTML exception. |
| A2-3 | `src/wait-for-wizard-close.ts:53`, `src/dispatch-import.ts:67` | major | Drop Markdown and HTML together; delay the Markdown modal's DOM commit beyond five seconds, for example by obscuring/minimizing Inkdrop immediately after the drop; let the appearance timeout run; then restore the window → HTML has already been dispatched without Markdown ever closing, and the late Markdown wizard can coexist with it. For Markdown-only drops the same timeout releases the guard while the original request is still pending. | The appearance timeout calls the same `finishWaiting()` used for an observed close, disconnects the observer, and resolves with no distinction between absence and closure. The sequence then unconditionally proceeds to HTML unless aborted. A fake-timer reproduction using the real wait and sequence verified `[markdownCommand, htmlCommand]` at 5000 ms with `wizard === null` and the observer disconnected, followed by the delayed Markdown appearance. Inkdrop's importer schedules `wizardDialog.show()` after the picker promise (`app.asar/packages/import-markdown/src/index.tsx:49–64`); it cannot be canceled by disconnecting this observer. Deferred React DOM commits when the window is hidden are measured in `probes/results.md`, “Harness requirements learned the hard way,” and `e2e/REPORT.md:16–28`. **Verification limit:** the exact minimize-before-first-paint sequence was not rerun live; the timeout/dispatch error is verified in isolation, and the rendering-delay trigger is supported by prior measurements. |

A2-1 is a user-visible persistent overlay, not merely a notification style preference. All three notification sites need the same correction. A2-2 concerns loss of a pending import selection; no claim is made that the isolated reproduction wrote any notes. A2-3 needs timeout handling that does not equate an unobserved wizard with a closed wizard; increasing the delay alone cannot establish that the pending importer has stopped.

## Source and runtime anchors

All plugin line references above belong to the reviewed commit. SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| `src/index.ts` | `d79b3d8435b87625b84ac28e1076889e4711d742743a66418f9511e33f917587` |
| `src/dispatch-import.ts` | `dc278dcfda2a4e025486680f74b5302237a61d648f6fe7fe2f90f5890c0eab5e` |
| `src/wait-for-wizard-close.ts` | `830dbb1fee81277a2d3d8794f45a093c09dfc6a251558c88fb92c597a616f430` |
| `lib/index.js` | `d14751ba08acbdf185ce6e30c59213e59c3908225e7312f7c7b6377e4c9d93e1` |
| Installed archive entry `renderer/assets/app--8nT0s9w.js` | `a45f1d846e0a816f2372dcdc80b8f04f00458bd2b6a2e8be9bfc12ffeed1e06d` |
| Installed archive entry `renderer/assets/notification-bar-Co6bqz1b.js` | `e2cb7994fbc5bcfba506c6723c5e223ee0aec7c6892bd33d138a9a42063ae4be` |
| Installed archive entry `packages/import-html/src/index.tsx` | `921cb7f039809e06baa7696a3ae7c2e7a2b127ec75f2c0901eb08c876486fd52` |

Archive root: `/Applications/Inkdrop.app/Contents/Resources/app.asar`.

For A2-1, the notification class and manager are on physical line 133 of `renderer/assets/app--8nT0s9w.js`; the complete notification component is on physical line 1 of `renderer/assets/notification-bar-Co6bqz1b.js`. Relevant exact expressions:

```js
isDismissable(){return!!this.options.dismissable}
dismiss(){this.isDismissable()&&!this.isDismissed()&&(this.dismissed=!0,this.emitter.emit(`did-dismiss`,this))}
```

The renderer's ten-second callback invokes dismissal, but that operation is a no-op for these notifications. Its filter explicitly keeps nondismissable notifications. The existing harness workaround therefore masks a product defect instead of proving the plugin notifications clean themselves up.

## Requested edge-case audit

The following items were considered separately from the three actionable findings. Conditional/synthetic observations are not being promoted to verified native-app bugs.

| Case | Observed behavior / conclusion |
|---|---|
| Empty transfer or zero supported files | With `types: ['Files']` and zero files, the committed bundle consumes the drop, dispatches no command, and emits no notification. Unsupported/virtual items produce the existing warning. No stuck guard for an empty sequence. |
| `types` and `files` disagree | A bundle reproduction with nonempty `files` but no `Files` type is ignored at `src/drop-listener.ts:28`. The reverse is consumed without import. Native probe transfers include `Files`; no native source of the contradictory combination was established, so this is not a separate finding. |
| Text-node target inside editor | A synthetic text node whose `parentElement` is inside `.editor` bypasses the `instanceof Element` test at `src/drop-listener.ts:26`; the bundle intercepts it and imports. This is a verified synthetic boundary gap, but native Inkdrop/Electron drops targeting a Text node were not established. Element targets inside the editor are excluded correctly. |
| Window target | The bundle safely skips the element test and processes the drop. No `closest()` crash. |
| Body not attached | `observer.observe(documentRoot.body, ...)` at `src/wait-for-wizard-close.ts:52` rejects when body is null. An isolated observer adapter verified the abort listener remains attached until deactivation because setup has no cleanup-on-throw. Native import commands are registered on `document.body`, so a working native importer before body exists was not established. The outer sequence still rejects and its guard clears. |
| Deactivate during awaits | Aborting while the wizard wait is pending disconnects it; the post-await signal check prevents HTML. Aborting before sequence entry dispatches nothing. Deactivating after an HTML command cannot retract that already-dispatched built-in wizard; the plugin does not own its import. The in-flight flag clears in `finally` after the sequence settles. |
| Existing own picker descriptor | Configurable own descriptors are restored exactly, including after synchronous throws. Existing tests cover this. |
| Nonconfigurable own picker | Isolated reproduction: `defineProperty` throws before dispatch; the original picker remains unchanged. The outer listener reports the error once. This is unsupported descriptor compatibility, not a leaked stand-in. The measured target uses an inherited method. |
| Synchronous dispatch exception | The `finally` restores the original descriptor or deletes the shadow; the sequence rejects and the listener reports it. Existing tests verify restoration. |
| Dispatch returns false | Without a picker invocation, false and true dispatch returns both produce one unavailable-importer error and stop the mixed sequence. The picker invocation is the success criterion. A return value alone cannot show that a listener did or did not request paths. |
| Picker called twice or zero times | Two synchronous calls both receive the dropped paths; the picker is restored afterwards. Zero calls stop the sequence with the existing error. Current native importer source and probes establish one synchronous call; a twice-calling importer would violate that integration assumption. No new native occurrence was found. |
| Appearance timeout after an observed wizard | Correct: observing the wizard clears the timer. An additional fake-timer check kept the wait unresolved beyond ten seconds, then resolved it on removal. The late-*first*-appearance case is A2-3. |
| Null wizard parent | With a real `Document.querySelector`, a returned element is attached to the queried tree and therefore has a parent; no asynchronous work intervenes before `observe(parentNode)`. A mock returning a detached element can throw, but this was not established as a real DOM race. |
| Removal of the entire observed parent | The narrowed observer at `src/wait-for-wizard-close.ts:44` does not observe removal of that parent from its own ancestor. Such a layout replacement could leave the wait pending until deactivation. No actual Inkdrop operation that removes the complete `.modal-layout` while retaining this plugin was established, so this remains a conditional robustness gap. Normal wizard removal is measured and covered. |
| HTML wizard never opens | The sequence neither observes nor awaits HTML. It returns after the picker call, so it cannot hang on absent HTML DOM and cannot distinguish a failed render from a successful opening. Current shipped HTML code calls `show()` directly after accepting paths. A2-2 covers the concrete premature guard release. |
| Markdown Cancel versus Confirm | Both remove the node, resolve the wait, and permit HTML for mixed drops. Cancel continuing to HTML is explicitly documented in `README.md:38`; it is not a bug. |
| Second drop during the five-second window | The guard refuses it until the first sequence resolves. The refusal notification has A2-1. After the timeout, the guard can clear while a late first wizard is pending: A2-3. |
| Windows separators/drive letters | `node:path` is external to the bundle and uses the host platform's semantics for both `extname` and `basename`. Applying POSIX semantics to Windows strings in a macOS-only mock would be a false-positive portability finding. No live Windows check was run. |
| Symlink loops | A top-level `statSync` ELOOP is caught and classified unsupported. The plugin does not recurse. The installed Markdown importer traverses only `Dirent.isDirectory()` entries (`importer.ts:74,164`), excluding interior symlink entries; no plugin-level unbounded traversal found. |
| Hundreds of paths / notification length | Classification and notification construction are linear in the number of items, with synchronous stat calls. The complete unsupported-name list is placed in a single unbounded message (`src/dispatch-import.ts:59`). No specific renderer freeze was established for hundreds of paths; the demonstrated undismissable large overlay is covered by A2-1. |
| Empty/non-UTF-8 names | An empty virtual `File.name` produces a blank entry in the warning. Ordinary native filesystem files cannot have an empty basename. Non-UTF-8 byte-name fidelity cannot be verified through the string-only Electron resolver using this read-only review; no corruption claim is made. |
| Trailing slash | A directory with a trailing slash remains a directory. A regular-file path with an invalid trailing slash fails `statSync` and becomes unsupported; this does not crash the plugin. |
| ENOENT versus EACCES | Both are caught and named as unsupported at `src/classify-paths.ts:20`. The user loses the diagnostic distinction, but this matches the current classifier contract and tests; it is not a newly discovered import crash. |
| Missing Electron `webUtils` | The bundle reproduction reported exactly one dismissable error: `drop-import: failed to open the import dialog`, detail `Cannot read properties of undefined (reading 'getPathForFile')`. Resolution aborts before dispatch. This is a poor compatibility diagnostic; no claim is made that an advertised Inkdrop version actually lacks the API. The default argument evaluates even for an empty transfer. |
| Bundle and loader | All seven `sourcesContent` entries in `lib/index.js.map` exactly match their source files. Read-through of the generated functions found no semantic divergence. `require('electron')` remains inside `resolveDroppedPaths`, not module initialization. Loading `lib/index.js` in Node succeeds without Electron; exports are `DropImportPlugin` and `default`, and `module?.default || module` selects an instance exposing `activate` and `deactivate`. |

## Unit-test assessment

- `src/dispatch-import.test.ts:111–129` proves the warning count and names, but its notification adapters discard options. It therefore passes with the permanently visible notifications in A2-1. The busy-notification test at `src/index.test.ts:50–68` has the same limitation.
- `src/dispatch-import.test.ts:132–136` correctly asserts there is no *Markdown* wait for HTML-only inputs. It does not assert the HTML wizard lifetime or prevent A2-2. The plugin in-flight test injects an arbitrary pending sequence, so it does not test when the real HTML sequence settles.
- `src/wait-for-wizard-close.test.ts:70–80` deliberately expects the appearance timeout to resolve. It does not compose that resolution with `dispatchImportSequence`, so it cannot detect HTML being dispatched before a delayed Markdown appearance. The observed-before-deadline test does correctly verify timer cancellation.
- The “non-file drags” fixture at `src/drop-listener.test.ts:59–77` changes only `types`, retaining a nonempty file array. It proves the type gate, rather than a realistic native non-file transfer. The synthetic mismatch is not evidence of a native event producer.
- The lifecycle test at `src/index.test.ts:38–47` deactivates after its injected sequence has already resolved. The sequence-level abort test and wait-level abort tests each pass, but they do not form an end-to-end lifecycle test. No extra finding is based solely on this coverage limitation.
- The previous symlink-by-name policy, own-descriptor restoration, virtual-file notification plumbing, and fixed contract comments remain intact. Resolved stylistic/documentation findings from rounds 1–3 are not repeated.

No production changes were made. The verdict rests on A2-1 through A2-3; the synthetic and conditional cases above are explicitly excluded from the actionable bug count.

VERDICT: CHANGES NEEDED

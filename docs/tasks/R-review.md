role: reviewer
Task R — independent review of the Inkdrop "drop-import" plugin before it is called done

Repository: <repository root> (git, branch master). Review the commit named in
the dispatch message; treat the working tree as that commit. Read-only: do not edit, build into,
install, relaunch Inkdrop, or run the E2E harness (it mutates the owner's live note database).
You may run `npx tsc --noEmit` and `npm test` (pure unit tests) and read every file.

## What was agreed (acceptance criteria)
1. docs/design.md is the owner-accepted design. Sections 1 (decisions), 2 (formats), 4 (picker
   stand-in), 5 (flow), 6 (structure), 7 (out of scope) are binding.
2. probes/results.md holds measured facts about Inkdrop 6.2.0 the code relies on.
3. ~/AGENTS.md implementation rules apply (naming, no situational comments, no planning jargon,
   no temporary safeguards baked into main logic, no over-engineering).
4. Evidence: e2e/REPORT.md with two full harness outputs (direct and drop modes, both exit 0),
   src/*.test.ts, and the coordinator's smoke drop (probes/smoke-plugin.mjs).

## Check, in this order
- Correctness of src/dispatch-import.ts against design §4: the stand-in is installed as an own
  property and restored in `finally` in every path (success, throw, importer absent); nothing
  else can observe it; the "importer not called" path notifies and stops; the Markdown → wait →
  HTML order; folder-only drops use the folders command.
- src/drop-listener.ts against §5/§6: capture phase on window; editor exclusion by `.editor`
  (and why `.cm-editor` would be wrong, see probes §4); file-less drags ignored; errors reported
  once; dispose removes both listeners.
- src/wait-for-wizard-close.ts against probes §5: resolves on removal; the 5 s appearance bound;
  abort behavior; observer leaks.
- src/classify-paths.ts, src/resolve-dropped-paths.ts against §2 and src/types.ts.
- src/index.ts lifecycle: activate twice, deactivate during an in-flight sequence.
- Any mismatch between README.md / e2e/README.md and the code's actual behavior.
- Test quality: do the unit tests assert behavior or implementation details; any case in §9 of
  the design not covered by either unit tests or the E2E scenarios (oversized is known-skipped).
- Rule violations from ~/AGENTS.md (name a file:line for each).

## Report format
Write <repository root>/.review/report.md (you may create that directory; it
is the only path you write). One findings table: `ID | file:line | severity (blocker/major/minor)
| rule or requirement | evidence | consequence`. Label anything not backed by file:line evidence
as "opinion". End with exactly one line: `VERDICT: ALIGNED` or `VERDICT: CHANGES NEEDED`.
Send worker_done with --outcome succeeded (the review completed) and --report-path pointing at
that file; the verdict lives inside the report.

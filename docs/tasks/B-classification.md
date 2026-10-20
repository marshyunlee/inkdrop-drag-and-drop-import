role: implementer
Task B — path classification for the Inkdrop "drop-import" plugin

Repository: <repository root> (git, branch master). Work directly in it.
Read first: docs/design.md §2 and §5 (what each dropped item kind means), probes/results.md §1
(how dropped files and folders arrive), src/types.ts (the contract; do not change it).
Also read ~/AGENTS.md: its implementation rules apply to every file you write.

## Target
Files you own: src/classify-paths.ts, src/resolve-dropped-paths.ts (both exist as stubs with
the final signatures — replace the bodies, keep the exported names and signatures), and
src/classify-paths.test.ts, src/resolve-dropped-paths.test.ts.
Do not edit any other file. Do not add dependencies.

## Change
1. `classifyPaths(paths: string[], stat: StatFunction): ClassifiedPaths`
   - A path whose `stat` says isDirectory() → markdown (folders go to the Markdown dialog).
   - A file whose extension, lower-cased, is in MARKDOWN_EXTENSIONS → markdown; in
     HTML_EXTENSIONS → html; anything else → unsupported.
   - `stat` throwing (missing path, permission) → unsupported.
   - A path that is neither a file nor a directory (socket, etc.) → unsupported.
   - Order within each bucket is the drop order. Duplicates are kept as given.
   - `isFolderOnly` is true only when markdown is non-empty and every markdown entry is a
     directory.
   - Symlinks: `fs.statSync` follows them, so a symlink to a folder is a folder. Do nothing
     special; just document it in one line in the test.

2. `resolveDroppedPaths(files: ArrayLike<File>, getPathForFile = webUtils.getPathForFile): string[]`
   - Default implementation uses `require('electron').webUtils.getPathForFile` (Electron 44 has
     no `File.path`; probes/results.md §1). Import electron lazily inside the function so the
     module can be imported in Node tests without electron present.
   - Returns the absolute paths in order. If `getPathForFile` returns an empty string for an
     entry, drop that entry (it is not a filesystem file).

## Constraints
- Pure functions, no I/O inside classifyPaths; `stat` is injected.
- Names: functions start with a verb and name their object. No situational comments.
- Tests use `node:test` + `node:assert/strict`, import local files with the `.ts` extension, and
  build fake `stat` functions from a path→kind map. Cover: each extension in upper and lower case
  (.MD, .Txt, .HTML, .htm), folder, missing path, mixed order preservation, isFolderOnly true /
  false / empty, duplicate paths, and resolveDroppedPaths with a fake getPathForFile including
  an empty-string return.

## Observable acceptance
- `npx tsc --noEmit` exits 0.
- `npm test` exits 0 with your tests included (the command runs `node --test src/*.test.ts`).
- Commit on master with a message describing the change (configure a git identity first if none is set).
- Final report: the file list, test names, and any contract ambiguity you resolved and how.

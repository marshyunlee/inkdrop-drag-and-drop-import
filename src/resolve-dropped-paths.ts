import type { ResolvedDroppedFiles } from './types.ts'

// Electron no longer exposes File.path on dropped files; webUtils.getPathForFile is the
// replacement and returns "" for items with no file on disk (e.g. an image dragged from a browser).
// Electron is required lazily so this module also loads in Node unit tests.
export function resolveDroppedPaths(
  files: ArrayLike<File>,
  getPathForFile: (file: File) => string = require('electron').webUtils.getPathForFile
): ResolvedDroppedFiles {
  const resolved: ResolvedDroppedFiles = { paths: [], virtualFileNames: [] }
  for (const file of Array.from(files)) {
    const path = getPathForFile(file)
    if (path === '') {
      resolved.virtualFileNames.push(file.name)
    } else {
      resolved.paths.push(path)
    }
  }
  return resolved
}

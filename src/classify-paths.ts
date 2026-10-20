import { extname } from 'node:path'
import { HTML_EXTENSIONS, MARKDOWN_EXTENSIONS } from './types.ts'
import type { ClassifiedPaths, StatFunction } from './types.ts'

// Folders count as Markdown items because Inkdrop's Markdown importer walks them itself.
// Extensions are matched on the dropped path, so a symlink is classified by its own name.
export function classifyPaths(paths: string[], stat: StatFunction): ClassifiedPaths {
  const classifiedPaths: ClassifiedPaths = {
    markdown: [],
    html: [],
    unsupported: [],
    isFolderOnly: false
  }
  let directoryCount = 0

  for (const path of paths) {
    let pathStat: ReturnType<StatFunction>
    try {
      pathStat = stat(path)
    } catch {
      classifiedPaths.unsupported.push(path)
      continue
    }

    if (pathStat.isDirectory()) {
      classifiedPaths.markdown.push(path)
      directoryCount++
    } else if (pathStat.isFile()) {
      const extension = extname(path).toLowerCase()
      if (MARKDOWN_EXTENSIONS.has(extension)) {
        classifiedPaths.markdown.push(path)
      } else if (HTML_EXTENSIONS.has(extension)) {
        classifiedPaths.html.push(path)
      } else {
        classifiedPaths.unsupported.push(path)
      }
    } else {
      classifiedPaths.unsupported.push(path)
    }
  }

  classifiedPaths.isFolderOnly =
    directoryCount > 0 && directoryCount === classifiedPaths.markdown.length
  return classifiedPaths
}

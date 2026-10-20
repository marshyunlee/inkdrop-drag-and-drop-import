import fs from 'node:fs'
import { classifyPaths } from './classify-paths.ts'
import { resolveDroppedPaths } from './resolve-dropped-paths.ts'
import { EDITOR_PANE_SELECTOR } from './types.ts'
import type { ClassifiedPaths } from './types.ts'

interface DropListenerOptions {
  importPaths: (paths: ClassifiedPaths) => Promise<void>
  reportError: (error: unknown) => void
  resolvePaths?: typeof resolveDroppedPaths
  classifyPaths?: typeof classifyPaths
}

// Listens in the capture phase so it runs before Inkdrop's own handlers, which set
// dropEffect to "none" and would otherwise stop every drop from reaching the page.
// Drops inside the editor pane are left untouched so the editor keeps its own behavior.
export function attachDropListener(
  windowRoot: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  options: DropListenerOptions
): () => void {
  const resolvePaths = options.resolvePaths ?? resolveDroppedPaths
  const classifyDroppedPaths = options.classifyPaths ?? classifyPaths

  function handleFileDrag(event: DragEvent) {
    const target = event.target
    if (target instanceof Element && target.closest(EDITOR_PANE_SELECTOR)) return
    const transfer = event.dataTransfer
    if (!transfer?.types.includes('Files')) return

    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'dragover') {
      transfer.dropEffect = 'copy'
      return
    }
    try {
      const { paths, virtualFileNames } = resolvePaths(transfer.files)
      const classifiedPaths = classifyDroppedPaths(paths, fs.statSync)
      classifiedPaths.unsupported.push(...virtualFileNames)
      void options.importPaths(classifiedPaths).catch(options.reportError)
    } catch (error) {
      options.reportError(error)
    }
  }

  windowRoot.addEventListener('dragover', handleFileDrag, true)
  windowRoot.addEventListener('drop', handleFileDrag, true)
  return () => {
    windowRoot.removeEventListener('dragover', handleFileDrag, true)
    windowRoot.removeEventListener('drop', handleFileDrag, true)
  }
}

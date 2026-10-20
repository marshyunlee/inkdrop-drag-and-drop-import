import { basename } from 'node:path'
import type { Environment } from '@inkdropapp/types'
import { IMPORT_COMMANDS, MARKDOWN_WIZARD_SELECTOR } from './types.ts'
import type { ClassifiedPaths } from './types.ts'

export interface ImportOptions {
  dialog: Pick<Environment['dialog'], 'showOpenDialog'>
  notifications: Pick<Environment['notifications'], 'addWarning' | 'addError'>
  dispatchCommand: (command: string) => unknown
  waitForWizardClose: (selector: string) => Promise<void>
  signal?: AbortSignal
}

// Inkdrop's built-in importers take no paths; they call dialog.showOpenDialog synchronously
// while their command runs. An own-property stand-in answers that one call with the dropped
// paths and is removed before dispatch returns, so the real picker is back for everyone else.
export function dispatchImportWithPaths(
  options: Pick<ImportOptions, 'dialog' | 'dispatchCommand' | 'notifications'>,
  command: string,
  filePaths: string[]
): boolean {
  const { dialog, dispatchCommand, notifications } = options
  const originalDescriptor = Object.getOwnPropertyDescriptor(dialog, 'showOpenDialog')
  let isPickerRequested = false

  Object.defineProperty(dialog, 'showOpenDialog', {
    configurable: true,
    writable: true,
    value: async () => {
      isPickerRequested = true
      return { canceled: false, filePaths }
    }
  })
  try {
    dispatchCommand(command)
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(dialog, 'showOpenDialog', originalDescriptor)
    } else {
      Reflect.deleteProperty(dialog, 'showOpenDialog')
    }
  }

  if (!isPickerRequested) {
    notifications.addError('drop-import: the built-in importer is not available (disabled or missing).')
  }
  return isPickerRequested
}

// Markdown items (files and folders) share one wizard; HTML has its own. The second wizard can
// only open once the first is gone, so the sequence waits for the Markdown wizard's removal.
export async function dispatchImportSequence(
  paths: ClassifiedPaths,
  options: ImportOptions
): Promise<void> {
  if (options.signal?.aborted) return
  if (paths.unsupported.length) {
    options.notifications.addWarning(
      `drop-import: unsupported items: ${paths.unsupported.map(item => basename(item)).join(', ')}`
    )
  }
  if (paths.markdown.length) {
    const command = paths.isFolderOnly
      ? IMPORT_COMMANDS.markdownFolders
      : IMPORT_COMMANDS.markdownFiles
    if (!dispatchImportWithPaths(options, command, paths.markdown)) return
    await options.waitForWizardClose(MARKDOWN_WIZARD_SELECTOR)
  }
  if (options.signal?.aborted) return
  if (paths.html.length) {
    dispatchImportWithPaths(options, IMPORT_COMMANDS.htmlFiles, paths.html)
  }
}

import { basename } from 'node:path'
import type { Environment } from '@inkdropapp/types'
import {
  DISMISSABLE_NOTIFICATION,
  HTML_WIZARD_SELECTOR,
  IMPORT_COMMANDS,
  MARKDOWN_WIZARD_SELECTOR
} from './types.ts'
import type { ClassifiedPaths, WizardWaitOutcome } from './types.ts'

export interface ImportOptions {
  dialog: Pick<Environment['dialog'], 'showOpenDialog'>
  notifications: Pick<Environment['notifications'], 'addWarning' | 'addError'>
  dispatchCommand: (command: string) => unknown
  waitForWizardClose: (selector: string) => Promise<WizardWaitOutcome>
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
    notifications.addError(
      'drop-import: the built-in importer is not available (disabled or missing).',
      DISMISSABLE_NOTIFICATION
    )
  }
  return isPickerRequested
}

// Markdown items (files and folders) share one wizard; HTML has its own. Each wizard is a
// singleton inside Inkdrop, so a new import command while one is open replaces its selection:
// the sequence therefore stays pending until the wizard it opened has closed.
export async function dispatchImportSequence(
  paths: ClassifiedPaths,
  options: ImportOptions
): Promise<void> {
  if (options.signal?.aborted) return
  if (paths.unsupported.length) {
    options.notifications.addWarning(
      `drop-import: unsupported items: ${paths.unsupported.map(item => basename(item)).join(', ')}`,
      DISMISSABLE_NOTIFICATION
    )
  }
  if (paths.markdown.length) {
    const command = paths.isFolderOnly
      ? IMPORT_COMMANDS.markdownFolders
      : IMPORT_COMMANDS.markdownFiles
    if (!dispatchImportWithPaths(options, command, paths.markdown)) return
    const outcome = await options.waitForWizardClose(MARKDOWN_WIZARD_SELECTOR)
    if (outcome === 'absent') {
      options.notifications.addWarning(
        paths.html.length
          ? 'drop-import: the import dialog did not open; the HTML files were not imported. Use File → Import instead.'
          : 'drop-import: the import dialog did not open. Use File → Import instead.',
        DISMISSABLE_NOTIFICATION
      )
    }
    if (outcome !== 'closed') return
  }
  if (options.signal?.aborted) return
  if (paths.html.length) {
    if (!dispatchImportWithPaths(options, IMPORT_COMMANDS.htmlFiles, paths.html)) return
    await options.waitForWizardClose(HTML_WIZARD_SELECTOR)
  }
}

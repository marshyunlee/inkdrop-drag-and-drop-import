import type { Environment, IInkdropPlugin } from '@inkdropapp/types'
import { dispatchImportSequence } from './dispatch-import.ts'
import { attachDropListener } from './drop-listener.ts'
import { ANY_IMPORT_WIZARD_SELECTOR, DISMISSABLE_NOTIFICATION } from './types.ts'
import { waitForWizardClose } from './wait-for-wizard-close.ts'

export interface PluginDependencies {
  attachDropListener: typeof attachDropListener
  dispatchImportSequence: typeof dispatchImportSequence
  isImportWizardOpen: () => boolean
}

function isImportWizardOpen(): boolean {
  return document.querySelector(ANY_IMPORT_WIZARD_SELECTOR) !== null
}

export class DropImportPlugin implements IInkdropPlugin {
  private disposeListener: (() => void) | null = null
  private abortController: AbortController | null = null
  private isImportInFlight = false
  private readonly dependencies: PluginDependencies

  constructor(
    dependencies: PluginDependencies = { attachDropListener, dispatchImportSequence, isImportWizardOpen }
  ) {
    this.dependencies = dependencies
  }

  activate(app: Environment) {
    // A drop while an import wizard is open would dispatch a second import command on top of it
    // and replace the wizard's selection. The in-flight flag covers the plugin's own sequence; the
    // DOM check covers a wizard that appeared after a timeout or that the user opened via File → Import.
    this.deactivate()
    const abortController = new AbortController()
    this.abortController = abortController
    this.disposeListener = this.dependencies.attachDropListener(window, {
      importPaths: async paths => {
        if (this.isImportInFlight || this.dependencies.isImportWizardOpen()) {
          app.notifications.addInfo('drop-import: an import is already in progress', DISMISSABLE_NOTIFICATION)
          return
        }
        this.isImportInFlight = true
        try {
          await this.dependencies.dispatchImportSequence(paths, {
            dialog: app.dialog,
            notifications: app.notifications,
            dispatchCommand: command => app.commands.dispatch(document.body, command),
            waitForWizardClose: selector => waitForWizardClose(selector, {
              signal: abortController.signal
            }),
            signal: abortController.signal
          })
        } finally {
          this.isImportInFlight = false
        }
      },
      reportError: error => {
        app.notifications.addError('drop-import: failed to open the import dialog', {
          detail: error instanceof Error ? error.message : String(error),
          dismissable: true
        })
      }
    })
  }

  deactivate() {
    this.disposeListener?.()
    this.disposeListener = null
    this.abortController?.abort()
    this.abortController = null
  }
}

export default new DropImportPlugin()

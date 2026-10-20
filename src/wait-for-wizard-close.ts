// Inkdrop removes a wizard's root element from the DOM when it closes, so "closed" means the
// node is gone. The wizard appears a moment after its command is dispatched; if it never does
// (importer refused silently), the wait gives up after the appearance timeout.
const WIZARD_APPEARANCE_TIMEOUT_MS = 5000

interface WizardWaitOptions {
  document?: Pick<Document, 'body' | 'querySelector'>
  MutationObserver?: typeof MutationObserver
  signal?: AbortSignal
}

export function waitForWizardClose(
  selector: string,
  options: WizardWaitOptions = {}
): Promise<void> {
  const documentRoot = options.document ?? document
  const Observer = options.MutationObserver ?? MutationObserver
  const { signal } = options

  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve()
      return
    }

    let appearanceTimer: ReturnType<typeof setTimeout> | undefined
    let isWizardObserved = false
    const observer = new Observer(inspectWizard)

    function finishWaiting() {
      observer.disconnect()
      clearTimeout(appearanceTimer)
      signal?.removeEventListener('abort', finishWaiting)
      resolve()
    }

    function inspectWizard() {
      const wizard = documentRoot.querySelector(selector)
      if (wizard) {
        if (!isWizardObserved) {
          isWizardObserved = true
          clearTimeout(appearanceTimer)
          observer.disconnect()
          observer.observe(wizard.parentNode!, { childList: true })
        }
      } else if (isWizardObserved) {
        finishWaiting()
      }
    }

    signal?.addEventListener('abort', finishWaiting, { once: true })
    observer.observe(documentRoot.body, { childList: true, subtree: true })
    appearanceTimer = setTimeout(finishWaiting, WIZARD_APPEARANCE_TIMEOUT_MS)
    inspectWizard()
  })
}

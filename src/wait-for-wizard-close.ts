import type { WizardWaitOutcome } from './types.ts'

// Inkdrop removes a wizard's root element from the DOM when it closes, so "closed" means the
// node is gone. The wizard appears a moment after its command is dispatched, but only while the
// window is visible: a hidden window never commits React updates, so the appearance timeout
// counts visible time only. If the wizard still has not appeared, the wait reports "absent".
const WIZARD_APPEARANCE_TIMEOUT_MS = 5000

type WaitDocument = Pick<
  Document,
  'body' | 'querySelector' | 'visibilityState' | 'addEventListener' | 'removeEventListener'
>

interface WizardWaitOptions {
  document?: WaitDocument
  MutationObserver?: typeof MutationObserver
  signal?: AbortSignal
}

export function waitForWizardClose(
  selector: string,
  options: WizardWaitOptions = {}
): Promise<WizardWaitOutcome> {
  const documentRoot: WaitDocument = options.document ?? document
  const Observer = options.MutationObserver ?? MutationObserver
  const { signal } = options

  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve('aborted')
      return
    }

    let appearanceTimer: ReturnType<typeof setTimeout> | undefined
    let isWizardObserved = false
    const observer = new Observer(inspectWizard)

    function finishWaiting(outcome: WizardWaitOutcome) {
      observer.disconnect()
      clearTimeout(appearanceTimer)
      documentRoot.removeEventListener('visibilitychange', restartAppearanceTimer)
      signal?.removeEventListener('abort', finishAborted)
      resolve(outcome)
    }

    function finishAborted() {
      finishWaiting('aborted')
    }

    function restartAppearanceTimer() {
      clearTimeout(appearanceTimer)
      if (documentRoot.visibilityState === 'visible') {
        appearanceTimer = setTimeout(() => finishWaiting('absent'), WIZARD_APPEARANCE_TIMEOUT_MS)
      }
    }

    function inspectWizard() {
      const wizard = documentRoot.querySelector(selector)
      if (wizard) {
        if (!isWizardObserved) {
          isWizardObserved = true
          clearTimeout(appearanceTimer)
          documentRoot.removeEventListener('visibilitychange', restartAppearanceTimer)
          observer.disconnect()
          observer.observe(wizard.parentNode!, { childList: true })
        }
      } else if (isWizardObserved) {
        finishWaiting('closed')
      }
    }

    signal?.addEventListener('abort', finishAborted, { once: true })
    documentRoot.addEventListener('visibilitychange', restartAppearanceTimer)
    observer.observe(documentRoot.body, { childList: true, subtree: true })
    restartAppearanceTimer()
    inspectWizard()
  })
}

/** Where a dropped item goes. `markdown` covers .md, .txt and folders (one Markdown dialog). */
export type DroppedItemKind = 'markdown' | 'html' | 'unsupported'

export interface ClassifiedPaths {
  /** Absolute paths of .md, .txt files and folders, in drop order. */
  markdown: string[]
  /** Absolute paths of .html / .htm files, in drop order. */
  html: string[]
  /** Absolute paths of everything else, including paths that no longer exist, plus the names of dropped items that have no filesystem path. */
  unsupported: string[]
  /** True when `markdown` is non-empty and contains only folders. */
  isFolderOnly: boolean
}

export interface ResolvedDroppedFiles {
  /** Absolute paths of the dropped filesystem items, in drop order. */
  paths: string[]
  /** Names of dropped items that have no filesystem path, such as an image dragged from a browser. */
  virtualFileNames: string[]
}

/** The subset of `fs.statSync` the classifier needs; injected so tests need no disk. */
export type StatFunction = (path: string) => { isDirectory(): boolean; isFile(): boolean }

export const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.txt'])
export const HTML_EXTENSIONS: ReadonlySet<string> = new Set(['.html', '.htm'])

/** Inkdrop commands the plugin dispatches. Both Markdown commands open the same wizard. */
export const IMPORT_COMMANDS = {
  markdownFiles: 'import-markdown:import-from-file',
  markdownFolders: 'import-markdown:import-from-directory',
  htmlFiles: 'import-html:import-from-file'
} as const

/** Root elements of the built-in wizards; Inkdrop removes them from the DOM when they close. */
export const MARKDOWN_WIZARD_SELECTOR = '.import-markdown-wizard-dialog'
export const HTML_WIZARD_SELECTOR = '.import-html-wizard-dialog'
/** Any open import wizard, whoever opened it; a new import command would replace its selection. */
export const ANY_IMPORT_WIZARD_SELECTOR = `${MARKDOWN_WIZARD_SELECTOR}, ${HTML_WIZARD_SELECTOR}`

/** How a wait for a wizard ended: it closed, it never appeared while the window was visible, or the plugin was deactivated. */
export type WizardWaitOutcome = 'closed' | 'absent' | 'aborted'

/** Inkdrop only lets the user (and its 10 s auto-dismiss) close notifications created with this. */
export const DISMISSABLE_NOTIFICATION = { dismissable: true } as const
/** The note editor pane (edit, preview and side-by-side modes). Drops here are left to Inkdrop. */
export const EDITOR_PANE_SELECTOR = '.editor'

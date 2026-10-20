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

/** Root element of the built-in Markdown wizard; it is removed from the DOM when the wizard closes. */
export const MARKDOWN_WIZARD_SELECTOR = '.import-markdown-wizard-dialog'
/** The note editor pane (edit, preview and side-by-side modes). Drops here are left to Inkdrop. */
export const EDITOR_PANE_SELECTOR = '.editor'

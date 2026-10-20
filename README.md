# drop-import

Drag Markdown or HTML files, or whole folders, from your file manager onto the Inkdrop window. Inkdrop's own **Import Notes** dialog opens with those items already selected, and you pick the destination notebook there, exactly as with File → Import.

Without this plugin, Inkdrop refuses drops everywhere except the note editor, and importing files means going through File → Import and the file picker.

## Install

From Inkdrop: **Preferences → Plugins**, search for `drop-import`, click Install.

From a terminal with the Inkdrop CLI: `ipm install drop-import`

Requires Inkdrop 6.0 or later on any desktop platform. Tested on macOS; reports from Windows and Linux are welcome.

## Use

1. Drag one or more files or folders from your file manager (Finder, File Explorer, Files, …).
2. Drop them anywhere in the Inkdrop window except the note editor: the notebook sidebar, the note list, or any empty area. The cursor shows "copy" when the drop will be accepted.
3. Inkdrop's import dialog opens. For Markdown it first shows what will be imported (file count, size, notebooks to be created), then asks for the destination notebook. For HTML it asks for the notebook directly.
4. Confirm. The notes appear in the chosen notebook.

Dropping onto a notebook in the sidebar does not preselect it; the dialog always asks, so a drop never lands in the wrong notebook.

## What can be dropped

| Dropped item | Result |
|---|---|
| `.md` file | One note. Title from a frontmatter `title`, else the first `# heading` (which is moved out of the body), else the file name. Images the file links to become attachments. |
| `.txt` file | One note, the text read as Markdown. |
| Folder | Every `.md` file at any depth; subfolders become nested notebooks; folders without any `.md` are skipped. `.txt` files inside folders are not imported. |
| `.html` / `.htm` file | One note, converted to Markdown, images attached. The title comes from the page's `<title>`. |
| Anything else (`.pdf`, `.docx`, images on their own, items with no file on disk such as an image dragged out of a browser) | Not imported. One notification lists their names. |

When you drop several items at once:

- All Markdown files, text files and folders go into **one** Markdown dialog, which lists them all.
- A folder dropped **alone** puts its files straight into the notebook you pick and turns its subfolders into notebooks under it. A folder dropped **together with other items** becomes its own notebook under the one you pick.
- A drop that contains both Markdown-side items and HTML files opens two dialogs in a row: Markdown first, then HTML once the first dialog closes (also after Cancel).
- While a dialog opened by a drop is still open, another drop is refused with an "import is already in progress" notification.
- Files larger than Inkdrop's attachment size limit stop the Markdown dialog until they are removed from the selection; that is Inkdrop's own check.

## Limits

- Dropping a file **into the note editor** keeps Inkdrop's existing behavior (it inserts into the open note); it does not import.
- The **app icon** (Dock or taskbar) is not a drop target.
- Items cannot be deselected inside the dialog; it offers Cancel or Next.
- The built-in `import-markdown` and `import-html` plugins must be enabled. The plugin feeds dropped paths to those importers; a future Inkdrop version could change how they ask for files, in which case drops would stop opening the dialog and nothing else would be affected.

## License

MIT. Source, development notes and the release procedure: [github.com/marshyunlee/inkdrop-drag-and-drop-import](https://github.com/marshyunlee/inkdrop-drag-and-drop-import) (see `docs/development.md`).

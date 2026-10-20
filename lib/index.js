Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let node_path = require("node:path");
let node_fs = require("node:fs");
node_fs = __toESM(node_fs);

//#region src/types.ts
const MARKDOWN_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".txt"]);
const HTML_EXTENSIONS = /* @__PURE__ */ new Set([".html", ".htm"]);
/** Inkdrop commands the plugin dispatches. Both Markdown commands open the same wizard. */
const IMPORT_COMMANDS = {
	markdownFiles: "import-markdown:import-from-file",
	markdownFolders: "import-markdown:import-from-directory",
	htmlFiles: "import-html:import-from-file"
};
/** Root element of the built-in Markdown wizard; it is removed from the DOM when the wizard closes. */
const MARKDOWN_WIZARD_SELECTOR = ".import-markdown-wizard-dialog";
/** The note editor pane (edit, preview and side-by-side modes). Drops here are left to Inkdrop. */
const EDITOR_PANE_SELECTOR = ".editor";

//#endregion
//#region src/dispatch-import.ts
function dispatchImportWithPaths(options, command, filePaths) {
	const { dialog, dispatchCommand, notifications } = options;
	const originalDescriptor = Object.getOwnPropertyDescriptor(dialog, "showOpenDialog");
	let isPickerRequested = false;
	Object.defineProperty(dialog, "showOpenDialog", {
		configurable: true,
		writable: true,
		value: async () => {
			isPickerRequested = true;
			return {
				canceled: false,
				filePaths
			};
		}
	});
	try {
		dispatchCommand(command);
	} finally {
		if (originalDescriptor) Object.defineProperty(dialog, "showOpenDialog", originalDescriptor);
		else Reflect.deleteProperty(dialog, "showOpenDialog");
	}
	if (!isPickerRequested) notifications.addError("drop-import: the built-in importer is not available (disabled or missing).");
	return isPickerRequested;
}
async function dispatchImportSequence(paths, options) {
	if (options.signal?.aborted) return;
	if (paths.unsupported.length) options.notifications.addWarning(`drop-import: unsupported items: ${paths.unsupported.map((item) => (0, node_path.basename)(item)).join(", ")}`);
	if (paths.markdown.length) {
		if (!dispatchImportWithPaths(options, paths.isFolderOnly ? IMPORT_COMMANDS.markdownFolders : IMPORT_COMMANDS.markdownFiles, paths.markdown)) return;
		await options.waitForWizardClose(MARKDOWN_WIZARD_SELECTOR);
	}
	if (options.signal?.aborted) return;
	if (paths.html.length) dispatchImportWithPaths(options, IMPORT_COMMANDS.htmlFiles, paths.html);
}

//#endregion
//#region src/classify-paths.ts
function classifyPaths(paths, stat) {
	const classifiedPaths = {
		markdown: [],
		html: [],
		unsupported: [],
		isFolderOnly: false
	};
	let directoryCount = 0;
	for (const path of paths) {
		let pathStat;
		try {
			pathStat = stat(path);
		} catch {
			classifiedPaths.unsupported.push(path);
			continue;
		}
		if (pathStat.isDirectory()) {
			classifiedPaths.markdown.push(path);
			directoryCount++;
		} else if (pathStat.isFile()) {
			const extension = (0, node_path.extname)(path).toLowerCase();
			if (MARKDOWN_EXTENSIONS.has(extension)) classifiedPaths.markdown.push(path);
			else if (HTML_EXTENSIONS.has(extension)) classifiedPaths.html.push(path);
			else classifiedPaths.unsupported.push(path);
		} else classifiedPaths.unsupported.push(path);
	}
	classifiedPaths.isFolderOnly = directoryCount > 0 && directoryCount === classifiedPaths.markdown.length;
	return classifiedPaths;
}

//#endregion
//#region src/resolve-dropped-paths.ts
function resolveDroppedPaths(files, getPathForFile = require("electron").webUtils.getPathForFile) {
	const resolved = {
		paths: [],
		virtualFileNames: []
	};
	for (const file of Array.from(files)) {
		const path = getPathForFile(file);
		if (path === "") resolved.virtualFileNames.push(file.name);
		else resolved.paths.push(path);
	}
	return resolved;
}

//#endregion
//#region src/drop-listener.ts
function attachDropListener(windowRoot, options) {
	const resolvePaths = options.resolvePaths ?? resolveDroppedPaths;
	const classifyDroppedPaths = options.classifyPaths ?? classifyPaths;
	function handleFileDrag(event) {
		const target = event.target;
		if (target instanceof Element && target.closest(".editor")) return;
		const transfer = event.dataTransfer;
		if (!transfer?.types.includes("Files")) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.type === "dragover") {
			transfer.dropEffect = "copy";
			return;
		}
		try {
			const { paths, virtualFileNames } = resolvePaths(transfer.files);
			const classifiedPaths = classifyDroppedPaths(paths, node_fs.default.statSync);
			classifiedPaths.unsupported.push(...virtualFileNames);
			options.importPaths(classifiedPaths).catch(options.reportError);
		} catch (error) {
			options.reportError(error);
		}
	}
	windowRoot.addEventListener("dragover", handleFileDrag, true);
	windowRoot.addEventListener("drop", handleFileDrag, true);
	return () => {
		windowRoot.removeEventListener("dragover", handleFileDrag, true);
		windowRoot.removeEventListener("drop", handleFileDrag, true);
	};
}

//#endregion
//#region src/wait-for-wizard-close.ts
const WIZARD_APPEARANCE_TIMEOUT_MS = 5e3;
function waitForWizardClose(selector, options = {}) {
	const documentRoot = options.document ?? document;
	const Observer = options.MutationObserver ?? MutationObserver;
	const { signal } = options;
	return new Promise((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}
		let appearanceTimer;
		let isWizardObserved = false;
		const observer = new Observer(inspectWizard);
		function finishWaiting() {
			observer.disconnect();
			clearTimeout(appearanceTimer);
			signal?.removeEventListener("abort", finishWaiting);
			resolve();
		}
		function inspectWizard() {
			const wizard = documentRoot.querySelector(selector);
			if (wizard) {
				if (!isWizardObserved) {
					isWizardObserved = true;
					clearTimeout(appearanceTimer);
					observer.disconnect();
					observer.observe(wizard.parentNode, { childList: true });
				}
			} else if (isWizardObserved) finishWaiting();
		}
		signal?.addEventListener("abort", finishWaiting, { once: true });
		observer.observe(documentRoot.body, {
			childList: true,
			subtree: true
		});
		appearanceTimer = setTimeout(finishWaiting, WIZARD_APPEARANCE_TIMEOUT_MS);
		inspectWizard();
	});
}

//#endregion
//#region src/index.ts
var DropImportPlugin = class {
	disposeListener = null;
	abortController = null;
	isImportInFlight = false;
	dependencies;
	constructor(dependencies = {
		attachDropListener,
		dispatchImportSequence
	}) {
		this.dependencies = dependencies;
	}
	activate(app) {
		this.deactivate();
		const abortController = new AbortController();
		this.abortController = abortController;
		this.disposeListener = this.dependencies.attachDropListener(window, {
			importPaths: async (paths) => {
				if (this.isImportInFlight) {
					app.notifications.addInfo("drop-import: an import is already in progress");
					return;
				}
				this.isImportInFlight = true;
				try {
					await this.dependencies.dispatchImportSequence(paths, {
						dialog: app.dialog,
						notifications: app.notifications,
						dispatchCommand: (command) => app.commands.dispatch(document.body, command),
						waitForWizardClose: (selector) => waitForWizardClose(selector, { signal: abortController.signal }),
						signal: abortController.signal
					});
				} finally {
					this.isImportInFlight = false;
				}
			},
			reportError: (error) => {
				app.notifications.addError("drop-import: failed to open the import dialog", {
					detail: error instanceof Error ? error.message : String(error),
					dismissable: true
				});
			}
		});
	}
	deactivate() {
		this.disposeListener?.();
		this.disposeListener = null;
		this.abortController?.abort();
		this.abortController = null;
	}
};
var src_default = new DropImportPlugin();

//#endregion
exports.DropImportPlugin = DropImportPlugin;
exports.default = src_default;
//# sourceMappingURL=index.js.map
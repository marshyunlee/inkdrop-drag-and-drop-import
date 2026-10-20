# Releasing to the Inkdrop plugin registry

The plugin is published as `drop-import` on Inkdrop's plugin registry. Users install it from Preferences → Plugins or with `ipm install drop-import`.

## How the registry delivers the plugin

Measured on 2026-10-20 with registry version 0.1.3: the registry's tarball URL for a version redirects to GitHub's archive of the git tag `v<version>` of the `repository` named in `package.json` (`codeload.github.com/<owner>/<repo>/legacy.tar.gz/refs/tags/v<version>`). Installers therefore download **the repository as committed at that tag**, not the tarball the CLI packs locally. When unpacking, `ipm install` keeps only what the `files` allowlist in `package.json` names, plus `package.json`, `README.md` and `LICENSE` (verified: an install of 0.1.4 produced exactly `lib/`, `LICENSE`, `package.json`, `README.md`).

Consequences:

- `lib/` (the build output, `main` in `package.json`) **must be committed**; a tag without it installs a plugin that cannot load.
- Keep `files` accurate: anything the plugin needs at runtime must be listed there.
- The tag `v<version>` must exist on GitHub **before** `ipm publish`, with the same version as `package.json`.
- Unpublishing a version removes it from the registry listing; deleting the git tag removes the download.

## One-time setup

1. Install the Inkdrop CLI (Node.js 24 or later):

   ```sh
   npm install -g @inkdropapp/ipm-cli
   ```

2. Authenticate with the Inkdrop account that owns the package:

   ```sh
   ipm configure
   ```

   This asks the running Inkdrop desktop app to display the account's access key (command `application:display-access-key` inside Inkdrop), prompts for it, and stores it in the system keychain. The key is never written to this repository.

## Publishing a new version

From the repository root, on a clean `master`:

```sh
npm ci
npm test && npm run typecheck
npm run build                     # refresh lib/index.js; it is committed
npm version patch                 # or minor / major: bumps package.json, commits, creates tag vX.Y.Z
git push --follow-tags            # the tag must be on GitHub before publishing
ipm publish --dry-run             # validates the manifest and authentication
ipm publish                       # registers the version; downloads come from the GitHub tag
ipm show drop-import              # confirm "Latest version" and the description
```

Verify the delivered artifact once per release:

```sh
curl -sL "https://api.inkdrop.app/v1/packages/drop-import/versions/X.Y.Z/tarball" | tar tz | grep 'lib/index.js'
```

The registry rejects a version that already exists, so every publish needs a version bump.

## Registry metadata

The registry page shows `description`, `keywords`, `repository`, `engines.inkdrop` and the README from the published `package.json`. Changing any of these requires a new version.

- `engines.inkdrop` (`^6.0.0`) decides which Inkdrop versions see the package at all; the registry filters by the client's major version.
- `repository` must point at the GitHub repository whose tags hold the releases.

## Unpublishing

```sh
ipm unpublish drop-import@X.Y.Z   # one version; answers a y/N prompt
ipm unpublish drop-import         # the whole package
```

Use the `package@version` form; `--version` is parsed as the CLI's own version flag. Unpublishing does not remove the plugin from machines that already installed it.

## Troubleshooting

- `You are not authenticated yet` on any command, including `--dry-run`: run `ipm configure`.
- The published plugin does not load in Inkdrop: download the tarball as above and check that `lib/index.js` is present and that `main` in `package.json` still points at it.
- On Windows, `ipm publish` has been reported to fail with an ESM URL-scheme error; publishing from WSL or macOS/Linux works.

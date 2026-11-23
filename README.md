<div align="center">

# 🐟 Fish Notes

A [Bear](https://bear.app)-like desktop Markdown note-taking app · React + Tauri v2 + TypeScript

Local-first · AI assistant · Full-text search · End-to-end encryption · Multiple themes · Tag organization

English · [简体中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/frank-1u/Fish-Notes?label=release&logo=github)](https://github.com/frank-1u/Fish-Notes/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-lightgrey.svg)](https://github.com/frank-1u/Fish-Notes/releases/latest)

![Fish Notes](./docs/screenshots/hero.png)

</div>

## Download

Download the Windows x64 packages from [GitHub Releases](https://github.com/frank-1u/Fish-Notes/releases).

| Package        | File                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| NSIS installer | `*-setup.exe`                                                               |
| Portable       | `Fish-Notes-<version>-windows-x64-portable.zip` containing `fish-notes.exe` |

Fish Notes uses the system Microsoft Edge WebView2 Runtime. The installer downloads the WebView2 bootstrapper when needed. For the portable build, install WebView2 separately if it is missing.

## Screenshots

|           Editor (split view)            |                  Themes                  |
| :--------------------------------------: | :--------------------------------------: |
| ![Editor](./docs/screenshots/editor.png) | ![Themes](./docs/screenshots/themes.png) |

## Tech Stack

| Layer            | Choice                                             |
| ---------------- | -------------------------------------------------- |
| Desktop          | Tauri v2 + Rust + system WebView                   |
| Frontend         | React 18 + TypeScript 5.7 + Vite 5                 |
| UI / Styling     | Tailwind CSS 3 + CSS Variables                     |
| Editor           | CodeMirror 6 (Markdown source + live highlighting) |
| Preview          | marked (GFM + breaks)                              |
| Database         | Bundled SQLite via rusqlite, WAL, r2d2             |
| Full-text search | SQLite FTS5                                        |
| Encryption       | AES-256-GCM + scrypt                               |
| AI               | OpenAI-compatible and Anthropic Messages HTTP APIs |
| i18n             | i18next + react-i18next                            |
| Export           | Markdown / sanitized HTML / system print to PDF    |
| Package manager  | Yarn Classic                                       |

## Features

### AI assistant

- **Generate titles and polish text** — suggest a title or refine a selection while preserving Markdown syntax
- **Streaming chat** — use the current note or search the knowledge base for context, view reasoning when the provider supplies it, cancel a reply, and reopen saved conversations
- **Provider settings** — choose OpenAI-compatible or Anthropic Messages and enter the Base URL, API key, and model under **Settings → AI**. The Rust backend calls the configured gateway and stores credentials locally.

### Editing

- **Markdown editor** — built on CodeMirror 6, source view with live highlighting, themed
- **3 view modes** — MD source / Preview / Split (side-by-side with synced scrolling), state persisted
- **Quick input** — toolbar + keyboard shortcuts for bold / italic / headings / quote / link / code / lists / tasks
- **Tables** — grid picker to insert aligned tables, one-click reformat to align column widths (CJK / full-width aware)
- **Smart behaviors** — list continuation, exit empty list on Enter, auto-closing brackets
- **Platform-aware** — toolbar tooltips show `⌘` (Mac) or `Ctrl+` (Win/Linux)

### Organization

- **Tags** — managed directly via the TagBar, nested tags `#parent/child`, tag tree in the sidebar
- **Full-text search** — powered by SQLite FTS5, plain-text index (Markdown syntax stripped)
- **Trash** — soft delete, restore, permanently delete
- **Pinning** — both notes and tags can be pinned

### Experience

- **Themes** — Light / Dark / Solarized / Anime
- **Multi-language** — English / Chinese
- **Auto-save** — 500ms debounce, Cmd/Ctrl+S to save immediately
- **Three-pane layout** — sidebar | note list | editor, with draggable widths
- **Native window controls** — system title bar on Windows and Linux, overlay title bar with traffic lights on macOS
- **External links** — clicking a link in preview opens it in the system browser

### Security

- **End-to-end encryption** — note content encrypted with AES-256-GCM, key derived via scrypt
- **Session lock** — the key lives only in memory and is cleared on lock
- **Encrypted notes stay out of FTS** — not surfaced in search

### Media

- **Images** — drag-and-drop, paste, or the `![]()` toolbar button
- **Local storage** — custom `fish-image://` protocol, UUID-named files

### Import and export

- **Import** — open Markdown, plain text, or HTML files in the native picker. HTML is converted to Markdown.
- **Export** — save Markdown or styled HTML with native dialogs, or use the system print dialog to save as PDF.

## Keyboard Shortcuts

### Editor views

| Shortcut       | Action    |
| -------------- | --------- |
| `Cmd/Ctrl + 1` | MD source |
| `Cmd/Ctrl + 2` | Preview   |
| `Cmd/Ctrl + 3` | Split     |

### Markdown formatting

| Shortcut               | Action        |
| ---------------------- | ------------- |
| `Cmd/Ctrl + B`         | Bold          |
| `Cmd/Ctrl + I`         | Italic        |
| `Cmd/Ctrl + Shift + S` | Strikethrough |
| `Cmd/Ctrl + 1~6`       | Heading 1–6   |
| `Cmd/Ctrl + K`         | Link          |
| `Cmd/Ctrl + E`         | Inline code   |
| `Cmd/Ctrl + Shift + E` | Code block    |
| `Cmd/Ctrl + Shift + .` | Blockquote    |
| `Cmd/Ctrl + Shift + L` | Bullet list   |
| `Cmd/Ctrl + Shift + O` | Numbered list |
| `Cmd/Ctrl + Shift + T` | Task list     |

### App

| Shortcut       | Action   |
| -------------- | -------- |
| `Cmd/Ctrl + S` | Save now |

## Development

Install Node.js 22, Yarn Classic, Rust stable with Clippy, and the platform dependencies. Windows development requires the MSVC C++ build tools and WebView2. Linux uses GTK and WebKitGTK 4.1, and macOS requires the Xcode command-line tools. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
yarn install --frozen-lockfile
yarn start                              # Tauri dev window and Vite HMR
npx tsc --noEmit
npx vite build
(cd src-tauri && cargo test --locked)
(cd src-tauri && cargo clippy --locked --all-targets -- -D warnings)
yarn package                            # release executable
yarn make                               # native bundle for the current platform
```

[CI](./.github/workflows/ci.yml) runs the frontend and Linux Rust checks for pull requests and pushes to `main` and `feat/**`.

## Windows builds and releases

Use **Actions → Release → Run workflow** on the candidate ref and download the Windows x64 artifact from the run summary. GitHub requires the workflow on the default branch to enable the manual trigger. To build a candidate locally on a Windows x64 host, run `npx tauri build --target x86_64-pc-windows-msvc -- --locked` after installing dependencies. The installer is under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`, and `fish-notes.exe` is in the target's `release/` directory. [GitHub manual workflow guide](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

For a tagged release, update the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` together and refresh `src-tauri/Cargo.lock`. Push a matching tag such as `v1.0.1` after Windows acceptance. The [Release workflow](./.github/workflows/release.yml) publishes both Windows packages to the matching GitHub Release. The independent macOS job builds the app with its Overlay window configuration.

### Windows host acceptance

Record the candidate commit, Windows and WebView2 versions, and results for both the NSIS-installed app and the executable extracted from the portable ZIP.

1. Verify each package is **≤ 15 MB**, excluding the system WebView2 Runtime. Install with NSIS and launch from the Start menu. Extract the portable ZIP, check that it contains only `fish-notes.exe`, and launch it on a host with WebView2. Check the native title bar, maximize/restore, Snap Layouts, and display scaling.
2. Close Fish Notes and wait for its WebView2 processes to exit. Time a cold launch until the editor accepts input. The target is **≤ 1.0 s**. Record steady-state memory while idle and during normal editing, summing Fish Notes and its WebView2 processes. The target is **≤ 120 MB** in both states.
3. Create, edit, autosave, and reopen notes. Check pinning, trash, restore, permanent deletion, nested tag management, and full-text search. Verify locked notes are absent from search and that password setup, change, removal, and session lock behave correctly.
4. Paste and drop images, render them in preview, and open an external link in the default browser. Import Markdown, text, and HTML. Export Markdown and HTML, then save a PDF with images through the system print dialog.
5. Configure the AI gateway and exercise connection testing, title suggestions, polishing, streaming chat with note and knowledge-base context, reasoning where available, cancellation, and history after relaunch. Type rapidly in a long note, switch notes and themes, scroll a large note list, and interact with the app during streaming. Check for input lag, flicker, and scrolling stalls.

Use separate test data directories for the two packages. For example, launch the portable executable from its extraction directory in PowerShell:

```powershell
$env:FISH_NOTES_USER_DATA = Join-Path (Get-Location).Path 'fish-notes-data'
.\fish-notes.exe
```

## Project structure

```text
src/renderer/
├── api/                  # typed Tauri commands and chat channels
├── components/           # note list, CodeMirror editor, preview, AI, settings
├── contexts/             # application, theme, and assistant state
└── styles/               # themes, Markdown preview, and print
src-tauri/
├── src/
│   ├── desktop.rs        # Tauri window, plugins, and protocol registration
│   ├── commands/         # IPC to application services
│   ├── service.rs        # shared application state and service entry point
│   ├── db/               # SQLite schema, connection pool, and FTS5
│   ├── ai/               # HTTP providers, SSE streaming, and retrieval
│   ├── crypto/           # passwords, session key, and note encryption
│   ├── images/           # local image storage and protocol responses
│   └── import_export/    # import conversion and export file writes
├── tests/                # service-level tests with real temporary SQLite
└── tauri*.conf.json      # shared and platform-specific desktop settings
```

## Local data

`fish-notes.db` and the `images/` directory live in Tauri's app data directory for `com.fishnotes.desktop` by default. Set `FISH_NOTES_USER_DATA` before launch to use another directory. SQLite stores notes, tags, note-tag links, settings, chat sessions, and messages. FTS5 indexes titles and plaintext for unlocked notes.

## License

MIT

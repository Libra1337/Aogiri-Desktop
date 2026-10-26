<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/brand/aogiri-horizontal-dark.svg">
    <img src="design/brand/aogiri-horizontal-light.svg" alt="Aogiri" width="440">
  </picture>

  <p>Coding agents, code, and project tools in one desktop workspace.</p>

  <p>
    <a href="https://www.lynshen.org/download">Download</a> ·
    <a href="https://github.com/Libra1337/Aogiri-Desktop/releases">All releases</a> ·
    <a href="https://github.com/Libra1337/Aogiri-Desktop/issues">Report an issue</a>
  </p>

  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
</div>

Manage multiple projects and sessions with LynShen, Claude Code, Codex, or any [ACP](https://agentclientprotocol.com)-compatible agent. Browse files, Git changes, terminals, and web pages alongside the conversation. Available for macOS, Windows, and Linux.

## Installation

| Platform | Package |
| --- | --- |
| macOS | `aarch64.dmg` for Apple silicon; `x64.dmg` for Intel |
| Windows x64 | `x64-setup.exe` |
| Linux x64 | `AppImage`, `.deb`, or `.rpm` |

Current packages are not notarized by Apple or signed for Windows, so your system may block the first launch. See the [installation guide](docs/install.md) for installation and security-prompt instructions.

You can update directly from an earlier LynShen Desktop release. Your sign-in, conversations, and settings are retained. Engines, accounts, and the `lynshen` command inside the app continue to use the LynShen name.

## Getting started

1. **Sign in or configure a model.** On first launch, sign in to a LynShen account in your browser, or skip sign-in and use your own API key or an existing agent account under Settings → Providers.
2. **Choose an agent.** LynShen is built in and ready to use. Install or add Claude Code, Codex, and ACP agents as needed. OpenCode, oh-my-pi, and Pi are built-in ACP agents: once installed, pick one in a new conversation with no command to register; the picker says what each can do and, when one is missing, how to install it. With any agent you can pick the model and thinking effort before the first message.
3. **Open a project and send a task.** A project can contain multiple sessions. Ask the agent to read code, edit files, or run commands; plan mode is available for discussing an approach first.

When signing in with a LynShen account, the app receives credentials for the current device, not your account password. Signing out revokes that device's credentials.

## Everyday use

- **Control permissions:** Press `Shift+Tab` to change approval mode. For an approval request, press `1` to allow once, `2` to always allow, or `3` or `Esc` to deny.
- **See what the agent is doing:** Each tool call shows its status and how long it took, and a light passes over the step that is running. A run of calls and the thinking between them is one line; edits read "Edited N files +a −b". Dividers mark where you stopped a turn, the engine restarted or the model changed, and the status line ends with the turn's time so far.
- **Work with your project:** When a turn ends, its work folds into one line with how long it took and which files it changed; open it to go through them. Files the agent delivers show as cards, with images and videos in the conversation; a scheduled task it proposes exists only once you click Create; conversations it started open with one click. All changes in the working tree are in the Git panel, with diff, staging, commit, pull, and push. Install GitHub CLI to work with pull requests. Independent Git worktrees are available for parallel tasks. A file opened from a turn's list of changes shows what that turn changed, or its changes since git HEAD. The project menu in the title bar shows the current branch and the uncommitted line counts, and opens the folder, switches branches, commits, pushes and pulls.
- **Pick the project first:** `⌘N` asks which project a new conversation belongs to (`⌘1`–`9` pick one directly), or none. In a Git repository a new conversation can start in a new worktree; a worktree setup script on the project page (installing dependencies, for example) runs first in each new worktree.
- **Fork from any turn:** Click Fork from here under a turn's reply: a new conversation goes on from the turns up to there, and the original stays as it is. A fork stays in the same folder or gets a new worktree with the files as that turn left them; the sidebar names where it came from, and Bring back writes up what the fork found and puts it in the original's input box. Needs a LynShen CLI that can fork.
- **Stay in one window:** Open a terminal or the built-in browser and bring web elements into the conversation. When an agent starts a dev server, a notice in the corner offers to open it. You can also switch to the agent's own terminal interface (TUI). The TUI belongs to the conversation: one opened in another window or on your phone can be viewed and typed into here, and closing the panel only stops viewing it while the TUI keeps running.
- **Extend your setup:** Manage models, skills, MCP servers, voice input, and image-generation models in Settings; switch deliverables, task proposals and messages between conversations in Settings → App tools; or import conversations and configuration from other coding tools.
- **Keep talking while the agent works:** Messages sent during a turn wait in a queue in the message box. Each can be added to the running turn (it goes in after the running tool, which keeps running), sent now by stopping the turn, taken back to edit, deleted, or reordered. Attachments go with the message as files; drop files anywhere on the window to attach them.
- **Keep tasks running:** Sessions run in a local background service. Closing the window or restarting the app does not stop an active task. Subagents and background commands still running after a turn ends are listed in the subagents card at the top right of the conversation, where you can read their output or stop them.
- **Run Claude Code and Codex on your own API:** In Settings → Coding agents, add a custom provider for Claude Code or Codex (API address, key, models) and test the connection. Requests go straight to that provider with its own key. They do not go through your LynShen account, carry no LynShen identity, and do not count toward LynShen usage or billing; the key stays on this computer. A new conversation can pick the provider, and a conversation keeps the one it started on.
- **See your subscription limits:** With a Claude Code or Codex subscription, a notice says which limit is near or reached, how much is used and when it resets, and can continue the turn once it resets.
- **Your own colours:** In Settings → General, pick a colour scheme (background, text, accent, links) for the light theme and one for the dark theme. A scheme without enough contrast is not applied. Schemes sync with your account.

### Keyboard shortcuts

Use `⌘` on macOS and `Ctrl` on Windows and Linux.

| Shortcut | Action |
| --- | --- |
| `⌘K` | Command palette |
| `⌘N` | New session (pick its project first; `⌘1`–`9` pick directly) |
| `⌘P` | Quick file open |
| `⌘F` | Find in conversation |
| `` Ctrl+` `` | Open terminal |
| `⌘B` | Toggle sidebar |
| `⌘.` | Stop generation |
| `⌘↵` | During a turn: add the message to it |
| `⌘⇧↵` | During a turn: stop it and send |
| `⌘/` | View all shortcuts |


## Remote access from your phone

Remote access is off by default. To enable it:

1. Sign in to your LynShen account, open Settings → Remote Access and enable relay access.
2. On the phone or in a browser, sign in to the same account and select Ask to connect on your computer. The computer shows a connect request: compare the 6 digits, then select Allow. A phone outside the account, or an older Aogiri, can use the QR code under Add a device with a pairing code.
3. View sessions, send messages, and respond to approvals in your phone's browser. You can also start a session on a built-in ACP agent installed on the computer (Pi needs the phone to be allowed "Switch to full auto"). When a conversation is in its TUI, the phone can watch it; a phone allowed "Open a terminal" can also type into it and open it, and one without that permission watches read-only.

Your phone and computer can be on different networks. Connection contents are end-to-end encrypted and cannot be read by the relay service. Paired devices can be revoked at any time. Devices paired before join the account on their first connection through it; after the computer switches accounts, allow them once more. Direct LAN / Tailscale connections are an advanced option for a signed-in computer.

## Data and privacy

- Prompts, code, and attachments are sent to the model provider used by the current session. Voice input is sent to your configured speech-recognition service. When Claude Code or Codex runs on a custom provider, requests go only to that provider with its own key and no LynShen account details; that usage is recorded on this computer only and is not uploaded.
- Credentials are stored locally in plaintext at `~/.lynshen/auth.json` by default. Optional static encryption is available, but it cannot protect against malicious software on your computer. Read the [security boundaries and usage notes](docs/secrets.md) before enabling it.
- After sign-in, model, engine, token usage, and duration statistics are collected. Prompts, code, and project paths are not reported. Some basic settings can sync across devices; keys, skills, and MCP configuration remain local.
- Anonymous usage statistics are enabled by default. They include feature-use counts, error types, and a random installation ID, but no conversations, code, or file paths. Turn them off under Settings → General.
- The app checks for and downloads updates from the LynShen website, then installs them after your confirmation.

## Troubleshooting

See the [installation guide](docs/install.md) for system security prompts, Linux dependencies, and permissions. For other problems, use Settings → General → Report Issue or open a [GitHub issue](https://github.com/Libra1337/Aogiri-Desktop/issues). Include your operating system, app version, agent, and error details; do not paste API keys or access tokens.

## Run from source

This repository contains the desktop app. Agent engines and the background service are in [Aogiri CLI](https://github.com/Libra1337/Aogiri-CLI). Development requires Node.js 22, pnpm, stable Rust, and the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/).

Place both repositories in the same parent directory, build the CLI, and start the desktop app:

```sh
git clone --recurse-submodules https://github.com/Libra1337/Aogiri-CLI.git
(cd Aogiri-CLI && cargo build)
git clone https://github.com/Libra1337/Aogiri-Desktop.git
cd Aogiri-Desktop
pnpm install
pnpm tauri dev
```

You can also use `LYNSHEN_BIN` to specify an existing `lynshen` executable. Common checks are `pnpm check` and `pnpm test`; run `pnpm build` before `cargo test --manifest-path src-tauri/Cargo.toml`. See [AGENTS.md](AGENTS.md) for architecture and development conventions.

## License

Code is licensed under the [Apache License 2.0](LICENSE); see also [NOTICE](NOTICE). The LynShen name and logo trademarks belong to LynShen Innovations INC. Third-party agents and tools belong to their respective owners.

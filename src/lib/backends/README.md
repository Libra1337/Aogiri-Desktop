# Engine backends

Every session runs in the local `lynshen daemon` (LynShen-CLI
`docs/daemon-protocol.md`), whichever backend it uses:

| id       | what the daemon runs |
|----------|----------------------|
| `lynshen` | the LynShen engine, in-process |
| `claude` | `claude --print --input-format stream-json …` |
| `codex`  | `codex app-server` |
| `acp`    | a registered ACP agent (`opencode acp`, a Settings preset; `gemini --experimental-acp`, …), command line from the registry (`docs/acp.md`) |

The daemon translates each engine into the lynshen event protocol and client
ops into the engine's own frames, so the desktop talks one protocol to all of
them: `ChatState` (the reducer behind the chat UI) and every view are
backend-agnostic, and each session's adapter is the lynshen one.

## Sessions in the daemon

`src/lib/daemon.ts` keeps one WebSocket to the daemon, which the desktop
starts on demand (`daemon_endpoint`, with the lynshen backend's binary and
environment from Settings). `SessionStore.#spawn` opens a session with
`session_create`, or reopens one with `session_open` by its conversation id
(restore, restart, provider or gateway switch). Claude Code and Codex
sessions pass an engine spec: approval mode, the LynShen gateway switch, the
binary and environment from Settings, and claude's `resume_at` for a rewind.

- Closing the desktop only disconnects: sessions keep running, and deferred
  actions wait in the daemon.
- Closing a tab ends its daemon session (`session_close`) and hides it for
  every client.
- A tab persists its conversation id as `sid`; restore lists it dormant and
  opens it when it is first shown.
- A daemon that can't be reached is retried with backoff for about 4.5
  minutes before the tab shows an error.
- "Continue in TUI" (`SessionStore.openInTui`) sets the tab's surface to
  `tui`; `TuiPanel` with `session` asks the daemon for `session_tui` and
  draws the engine's own TUI with xterm in the same tile. Quitting it returns
  the tab to the chat (`returnToGui`); the daemon restarts the engine and
  sends the transcript with the TUI's turns. Other clients see a notice
  while the conversation is in the terminal (`ChatState.inTerminal`).
- File paths in replies (`src/a.ts:12`, a code block titled with a path)
  become links (`fileRefs.ts`, `markdown.ts`); clicking one opens the file in
  the editor at that line, or in the files screen on a paired device.

## The adapter (`types.ts`, `lynshen.ts`)

```ts
interface EngineAdapter {
  readonly id: BackendId;
  readonly caps: BackendCaps;
  onStart(io: AdapterIO, ctx: SessionCtx): void;
  translate(raw: unknown): NormalizedEvent[];   // NormalizedEvent = lynshen AgentEvent
  encodeOp(op: Op): string[] | null;
}
```

The lynshen adapter passes events through, checks the `hello` protocol
version and maps approval-mode names between the desktop's trio and the
engine's (`read-only` ↔ `manual`, `full-auto` ↔ `full-access`).
`router.ts` holds each session's adapter and its op queue while the engine
is (re)starting; `dispatch(sessionId, op)` is how every UI call site sends.

### Daemon features (`hello.features`)

The daemon's hello names what it takes beyond its protocol version
(`engine.features`, `engineHas` in `engineVersion.svelte.ts`). A daemon
from before sends none, and the app keeps its old behaviour:

| feature | with it | without it |
|---------|---------|------------|
| `queue` | the queue tray's rows (`composer/queue.ts`): `steer`, `interrupt`, `unqueue` (with `discard`) and `queue_move`, each with the row's `index` and `text`, on every engine (an ACP agent has no 插入: its rows stop the turn and send); ⌘↵ / ⌘⇧↵; Claude Code's `fixed` rows | the single 插入 (`steer`, first message) where `caps.steer`, and 撤回 where `caps.unqueue` on 0.4.27 or later |
| `files` | `user_message.files` (attachments other than images; a video as a file), echoed as `files` on `user_message`, `unqueued`, `fill_input` and the transcript | the files listed after the text (`attachments.ts`), a video as keyframes |

A `steer` takes the message in once a running tool ends; it never cuts the tool.

### Capability flags → UI surfaces

`caps.ts` says which protocol features each backend's engine supports.

| cap             | gated surface(s) |
|-----------------|------------------|
| `approvalModes` | composer approval-mode picker |
| `hunkApproval`  | per-hunk checkboxes on the approval card |
| `steer`         | a daemon without the hello's `queue` feature: the queue tray's single 插入 for the first message |
| `unqueue`       | a daemon without `queue` (0.4.27 or later): the tray's 撤回 |
| `interrupt`     | stop button while busy |
| `branchTree`    | /tree palette entry, branch picker |
| `goals`         | right-dock Plan/Goal tabs |
| `skills`        | marketplace palette entry / install actions |
| `mcpManage`     | Settings → 扩展 MCP mutations |
| `checkpoints`   | /rewind palette entry, checkpoint picker, per-message rewind |
| `contextUsage`  | composer context ring |
| `compact`       | /compact palette entry (compaction_start/end/failed events) |
| `modelPicker`   | composer model button, /model palette entry, provider switch (provider switch itself is lynshen-only: it rewrites the native engine's config) |
| `resume`        | /resume palette entry, history picker, tab persistence |
| `subagents`     | subagent status strip |
| `transcriptReplay` | resume replays the transcript into the message list |
| `slashCommands` | generic slash entries (/compact, /context, /stats, /doctor, engine command list) |
| `mcpEngineOwned` | Settings → 扩展 MCP lists the engine's own servers: switch and reconnect only, no add/edit/delete |
| `ruleScopes` | 始终允许 asks for a scope (session / project / all projects); Settings → 编程智能体 lists the permission rules |
| `sideQuestions` | `/btw <question>` answers in the task strip (`side_answer`) |
| `agentTrace` | the 智能体 workbench panel (`AgentRunsPanel.svelte`), its links from the task strip, the subagent strip and Agent / Workflow tool cards |

The single gating helper is `caps(chat)` from `$lib/backends` — components
never test `backendId` directly.

### Codex specifics

- Mid-turn messages wait in the daemon (`pending_messages`, the composer's
  queue tray); a row's 插入 joins it to the running turn.
- Plan and auto modes, the agent trace (subagent threads), its own MCP
  servers (reconnect, sign in; no switch) and session switches (fast =
  service tier `priority`, thinking = reasoning summaries) as for Claude.
- A command approval may offer `scopes` (`session`, `rule`): the
  always-allow menu shows exactly those.

### Claude specifics the desktop still drives

- **Yolo** (`bypassPermissions`) can't be set live: `respawnClaudeYolo` closes
  the daemon session and reopens it in that mode.
- **Rewind**: the daemon reopens the conversation with
  `--resume-session-at <assistant uuid>`; the desktop truncates its transcript
  to match.
- Reopening a claude conversation keeps the messages this tab already shows
  (`ChatState.keepNextTranscript`): the daemon's replay is plain text, without
  tool cards or message uuids.
- **Session switches** (`composer/SessionSwitches.svelte`, under the effort
  slider): ultracode, fast mode and thinking summaries, each shown while
  `model_status` offers it; they send `/effort ultracode`, `/fast`,
  `/thinking` `on|off`. A respawn passes `ultracode`, `fast`, `effort` and
  `thinking` so the new engine keeps them.
- **Agent trace** (`AgentRunsPanel.svelte`, `agentTrace.ts`): each Workflow
  as a timeline of its agents by phase (state, model, time, tokens, tool
  calls), the Task subagents below, and a picked subagent's conversation,
  read-only (`subagent_transcript`, re-read every 2.5 s while it runs).
  `chat.agentFocus` says which subagent it shows. The desktop opens it as a
  workbench panel, the web page as a full-screen sheet.
- **Background tasks** (`agents/BackgroundCommands.svelte` in the subagents card; `sessionStatus` `background`): `background_tasks` is the live
  set, with a stop button each and a shell's output on demand; a finished
  one is a system line (`task_done`).
- `/resume` has no wire form in stream-json mode: ChatPane builds the picker
  from the daemon's `session_history` for the project and opens a pick in a
  new tab.

## Rust surface

- `daemon_endpoint(bin_override?, env?)` — the daemon's URL and token,
  starting it first when needed.
- `check_backend(backend, bin_override?) → { found, path?, version? }` —
  Settings' availability probe.
- `pty_open` — native TUI tabs, with a fixed per-backend argv allowlist
  (`src-tauri/src/backend.rs`).

Binary resolution order: `LYNSHEN_BIN`/`CODEX_BIN`/`CLAUDE_BIN` env override →
settings path override → PATH → well-known dirs (`/opt/homebrew/bin`,
`/usr/local/bin`, `~/.cargo/bin`, `~/.local/bin`, claude's `~/.claude/local`,
Windows equivalents) → (lynshen only) sibling dev build.

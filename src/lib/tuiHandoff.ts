// Pure helpers for the GUI ⇄ TUI session handoff: which backends can hand a
// conversation to their own TUI, and which conversation ids it can resume.
// The daemon runs the TUI itself (`session_tui`).

import type { AcpAgentRef, BackendId } from './backends/types';

/** Mirrors Rust `is_valid_session_id`: nonempty, ≤64 chars, no leading dash,
 *  ascii alphanumerics + dashes only. */
export function isValidResumeSessionId(s: string): boolean {
	return s.length > 0 && s.length <= 64 && !s.startsWith('-') && /^[a-zA-Z0-9-]+$/.test(s);
}

/** The built-in ACP agents whose TUI the daemon knows (`acp_presets` `tui`). */
const TUI_BUILTINS = new Set(['opencode', 'omp', 'pi']);

/** Backends whose session can move to the native TUI: the native CLIs, and
 *  (a daemon with built-in ACP agents, `acpTui`) a built-in agent's session
 *  or a registered OpenCode's. Another registered ACP agent has no TUI the
 *  daemon could run. */
export function canHandOffToTui(
	backend: BackendId,
	agent?: Pick<AcpAgentRef, 'id' | 'builtin' | 'opencode'>,
	acpTui = false
): boolean {
	if (backend === 'acp') return acpTui && !!agent && (agent.builtin ? TUI_BUILTINS.has(agent.id) : !!agent.opencode);
	return backend === 'lynshen' || backend === 'claude' || backend === 'codex';
}

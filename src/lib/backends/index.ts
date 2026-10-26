// Backend registry: the capability table and its gating helper.

import type { BackendCaps, BackendId } from './types';
import { LYNSHEN_CAPS } from './lynshen';
import { ACP_CAPS, CLAUDE_CAPS, CODEX_CAPS, OPENCODE_CAPS } from './caps';

export type { AcpAgentRef, BackendCaps, BackendId, EngineAdapter, AdapterIO, SessionCtx, NormalizedEvent } from './types';
export { BACKEND_IDS, NATIVE_BACKEND_IDS, BACKEND_LABELS, isBackendId, normalizeBackendId } from './types';

/** Static capability table. */
export const CAPS: Record<BackendId, BackendCaps> = {
	lynshen: LYNSHEN_CAPS,
	codex: CODEX_CAPS,
	claude: CLAUDE_CAPS,
	acp: ACP_CAPS
};

/**
 * THE capability-gating helper: every UI surface asks this one function.
 * Accepts anything carrying a `backendId` (ChatState does) — or nothing, which
 * gates like the native backend so pre-existing UI behavior is unchanged. An
 * ACP session of OpenCode (`acpOpencode`) has OpenCode's capabilities.
 */
export function caps(
	chat?: { backendId?: string; acpOpencode?: boolean; engineCaps?: Partial<BackendCaps> | null } | null
): BackendCaps {
	const id = chat?.backendId;
	if (id === 'acp') {
		const base = chat?.acpOpencode ? OPENCODE_CAPS : ACP_CAPS;
		// What the agent reports (`engine_caps`, the daemon's full ACP client)
		// over that table: only the flags it names, and only as booleans.
		const reported = chat?.engineCaps;
		if (!reported) return base;
		const merged = { ...base };
		for (const k of ACP_REPORTED) if (typeof reported[k] === 'boolean') merged[k] = reported[k];
		// OpenCode's plan mode is the daemon's own agent, not the ACP one.
		if (!merged.approvalModes) merged.planMode = false;
		return merged;
	}
	return (id && id in CAPS ? CAPS[id as BackendId] : CAPS.lynshen);
}

/** The flags an ACP agent's `engine_caps` sets (its `caps`); the rest stay
 *  the table's. */
const ACP_REPORTED = ['interrupt', 'approvalModes', 'modelPicker', 'contextUsage', 'slashCommands', 'transcriptReplay'] as const;

// What a phone may start a session on: the native engines, and the
// computer's built-in ACP agents (a daemon with `acp_presets`), which the
// daemon starts by id alone (`options.agent`). Agents registered on the
// desktop run commands only the desktop may choose, so they are not offered.

import { BACKEND_LABELS } from '$lib/backends/types';
import type { AcpBuiltin } from '$lib/protocol';
import { builtinNote } from '$lib/acpBuiltins.svelte';

export interface EngineRow {
	/** `lynshen`, `claude`, `codex`, or `acp:<id>`. */
	key: string;
	engine: string;
	/** The built-in agent's id, for `acp`. */
	agent?: string;
	label: string;
	/** Not installed, too old, or (an agent that never asks) without the
	 *  phone's 全自动 permission. */
	disabled: boolean;
	/** Why it is disabled, or 无审批 for an agent that never asks. */
	note?: string;
	/** The agent never asks before running tools: it starts in 全自动. */
	noApprovals?: boolean;
}

export function engineKey(engine: string | undefined, agent?: string | null): string {
	return engine === 'acp' && agent ? `acp:${agent}` : (engine ?? 'lynshen');
}

/** The rows of a phone's engine choice. `fullAuto`: this phone may start a
 *  session in 全自动 (its `full_auto` scope), which an agent that never asks
 *  needs. */
export function pickEngines(builtins: AcpBuiltin[], fullAuto: boolean, noFullAuto = ''): EngineRow[] {
	return [
		...(['lynshen', 'claude', 'codex'] as const).map((engine) => ({ key: engine, engine, label: BACKEND_LABELS[engine], disabled: false })),
		...builtins.map((a) => {
			const ready = a.status === 'ready';
			const blocked = ready && !a.approvals && !fullAuto;
			return {
				key: `acp:${a.id}`,
				engine: 'acp',
				agent: a.id,
				label: a.name,
				disabled: !ready || blocked,
				note: blocked ? noFullAuto : builtinNote(a) || undefined,
				...(!a.approvals ? { noApprovals: true } : {})
			};
		})
	];
}

/** The sessions a phone lists: a closed ACP session only when it ran a
 *  built-in agent (a registered agent's reopens on the desktop only). */
export function listable(s: { engine?: string; open?: boolean; acp_agent?: { builtin?: boolean } | null }): boolean {
	return s.engine !== 'acp' || !!s.open || !!s.acp_agent?.builtin;
}

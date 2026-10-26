// The built-in ACP agents of the daemon this page talks to (`acp_presets`):
// OpenCode, oh-my-pi and Pi, which the daemon finds, checks and starts by id,
// so no client ever names their command. Shared by the agent pickers and
// Settings → 外部智能体. A daemon without the feature has none, and the
// registered agents (acp_registry.rs) are offered as before.
import { acpBuiltins, type AcpBuiltin } from '$lib/protocol';
import { engineHas } from '$lib/engineVersion.svelte';
import { t } from '$lib/i18n';
import { confirm } from '$lib/ui/confirm.svelte';

export type { AcpBuiltin };

export const builtinAgents = $state<{ list: AcpBuiltin[]; loaded: boolean; error: string }>({ list: [], loaded: false, error: '' });

let load: Promise<AcpBuiltin[]> | null = null;
let loadedAt = 0;
/** The daemon asks each program its version: kept for a minute. */
const FRESH_MS = 60_000;

/** Reads the list (again with `fresh`, or once it is a minute old). A daemon
 *  without built-in agents answers with none. */
export function loadBuiltinAgents(fresh = false): Promise<AcpBuiltin[]> {
	if (!engineHas('acp_presets')) {
		builtinAgents.list = [];
		builtinAgents.loaded = true;
		return Promise.resolve([]);
	}
	if (load && !fresh && Date.now() - loadedAt < FRESH_MS) return load;
	loadedAt = Date.now();
	load = acpBuiltins().then(
		(list) => {
			builtinAgents.list = list;
			builtinAgents.loaded = true;
			builtinAgents.error = '';
			return list;
		},
		(e) => {
			load = null;
			builtinAgents.loaded = true;
			builtinAgents.error = e instanceof Error ? e.message : String(e);
			return [];
		}
	);
	return load;
}

/** What an agent's row says beside its name: why it cannot start, or that
 *  it never asks (Pi); '' for a ready agent that asks. */
export function builtinNote(a: Pick<AcpBuiltin, 'status' | 'min_version' | 'below_version' | 'approvals'>): string {
	if (a.status === 'missing') return t('settings.acp.notInstalled');
	if (a.status === 'unsupported')
		return a.below_version ? t('settings.acp.needsBelow', { below: a.below_version }) : t('settings.acp.tooOld', { min: a.min_version ?? '' });
	return a.approvals ? '' : t('chat.noApproval');
}

/** The capability chips of an agent's row in Settings. */
export function builtinCaps(a: Pick<AcpBuiltin, 'approvals' | 'gateway' | 'tui'>): string[] {
	return [
		a.approvals ? t('settings.acp.capApprovals') : t('settings.acp.capFullAutoOnly'),
		a.gateway && t('settings.acp.capGateway'),
		a.tui && t('settings.acp.capTui')
	].filter((c): c is string => !!c);
}

/** The session's agent for a built-in one. */
export function builtinRef(a: Pick<AcpBuiltin, 'id' | 'name' | 'approvals'>) {
	return {
		id: a.id,
		name: a.name,
		builtin: true as const,
		...(a.id === 'opencode' ? { opencode: true as const } : {}),
		...(!a.approvals ? { noApprovals: true as const } : {})
	};
}

/** Asks before a conversation starts on an agent that never asks before it
 *  runs tools (Pi): it can only run in 全自动. */
export function confirmNoApprovals(name: string): Promise<boolean> {
	return confirm({
		title: t('chat.noApprovalTitle', { name }),
		message: t('chat.noApprovalHint'),
		confirmLabel: t('chat.noApprovalConfirm'),
		danger: true
	});
}

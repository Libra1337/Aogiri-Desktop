// Claude Code's and Codex's custom providers as the daemon last said, shared
// by Settings (which changes them) and the composer's provider row (which
// offers them to a new conversation). The daemon keeps them and their keys;
// a daemon without the `tool_providers` feature has none.
import { toolProviders, type ProviderTool, type ToolApiProvider, type ToolProviderConfig, type ToolProviderOp } from '$lib/protocol';

export type { ProviderTool };

export const toolProviderConfigs = $state<Partial<Record<ProviderTool, ToolProviderConfig>>>({});

const loads = new Map<ProviderTool, Promise<ToolProviderConfig>>();

/** Reads `tool`'s providers once per app run (again after a failure, or
 *  with `fresh`). */
export function loadToolProviders(tool: ProviderTool, fresh = false): Promise<ToolProviderConfig> {
	let load = fresh ? undefined : loads.get(tool);
	if (!load) {
		load = toolProviders(tool).then(
			(config) => {
				toolProviderConfigs[tool] = config;
				return config;
			},
			(e) => {
				loads.delete(tool);
				throw e;
			}
		);
		loads.set(tool, load);
	}
	return load;
}

/** Saves, removes or selects; the daemon answers with the whole config. */
export async function changeToolProviders(
	tool: ProviderTool,
	op: Exclude<ToolProviderOp, 'tool_providers'>,
	fields: Record<string, unknown>
): Promise<ToolProviderConfig> {
	const config = await toolProviders(tool, op, fields);
	toolProviderConfigs[tool] = config;
	loads.set(tool, Promise.resolve(config));
	return config;
}

/** The provider a new conversation of `tool` starts on: its own pick ('' is
 *  the tool's own login or config), else the tool's default. */
export function draftProvider(tool: string, pick: string | undefined): ToolApiProvider | undefined {
	if (tool !== 'claude' && tool !== 'codex') return undefined;
	const config = toolProviderConfigs[tool];
	const id = pick ?? config?.selected ?? '';
	return id ? config?.providers.find((p) => p.id === id) : undefined;
}

/** Whether a base URL is one the daemon takes: http(s), with a host, and no
 *  credentials, query or fragment. */
export function providerUrlOk(url: string): boolean {
	try {
		const u = new URL(url);
		return /^https?:$/.test(u.protocol) && !!u.host && !/[?#@]/.test(url);
	} catch {
		return false;
	}
}

/** A provider's id from its name: lowercase letters, digits, `-`; another
 *  one's id gets a number. */
export function providerId(name: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'provider';
	if (!used.has(base)) return base;
	for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The name of an unnamed provider: its API host's second-level name
 *  ("api.example.com" → "example"). */
export function providerLabel(name: string, url: string): string {
	if (name.trim()) return name.trim();
	try {
		return new URL(url).hostname.split('.').slice(-2)[0] || 'provider';
	} catch {
		return 'provider';
	}
}

/** A key as the form shows a saved one: never the key itself. */
export const MASKED_KEY = '••••••••';

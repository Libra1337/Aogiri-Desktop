// What an agent offers (its model, models, efforts and slash commands),
// known before any session of it runs: the daemon runs the engine once out
// of every list (`engine_probe`, LynShen CLI with the hello's
// `engine_probe`, B08) and the answer goes into the backend profile a draft
// is seeded from (backendProfile.ts). A profile probed lately is not probed
// again; the daemon keeps its own answer for 10 minutes. LynShen needs no
// probe, and an ACP agent opens a session of its own to answer, so neither
// is probed.
import { daemon } from './protocol';
import { buildBackendOpts } from './backends/settings';
import { loadProfile, profileKey, rememberProfile, type BackendProfile } from './backendProfile';
import { engineHas } from './engineVersion.svelte';
import type { BackendId } from './backends';
import type { CommandItem, ModelOption } from './chat.svelte';

/** A profile probed more recently than this is current. */
export const PROBE_FRESH_MS = 6 * 3_600_000;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The profile a probe's events make (the fields a session's events set,
 *  ChatState.#remember). */
export function profileFromEvents(events: Record<string, unknown>[]): BackendProfile {
	const patch: BackendProfile = {};
	for (const ev of events) {
		if (ev.type === 'model_status') {
			if (str(ev.provider)) patch.provider = str(ev.provider);
			if (str(ev.model)) patch.model = str(ev.model);
			if (str(ev.model_label)) patch.modelLabel = str(ev.model_label);
			if (str(ev.reasoning_effort)) patch.effort = str(ev.reasoning_effort);
			if (Array.isArray(ev.reasoning_efforts)) patch.efforts = arr<string>(ev.reasoning_efforts);
			if (typeof ev.context_window === 'number' && ev.context_window > 0) patch.contextWindow = ev.context_window;
		} else if (ev.type === 'model_view') {
			patch.catalog = arr<ModelOption>(ev.models);
			if (str(ev.active_effort)) patch.catalogEffort = str(ev.active_effort);
		} else if (ev.type === 'command_list') {
			patch.commands = arr<CommandItem>(ev.commands);
		}
	}
	return patch;
}

const running = new Map<string, Promise<boolean>>();

/** Probes Claude Code or Codex unless its profile is fresh (`force`: anyway)
 *  or the daemon cannot; true when the profile changed. One probe per
 *  backend at a time. */
export function probeEngine(backend: BackendId, force = false): Promise<boolean> {
	if ((backend !== 'claude' && backend !== 'codex') || !engineHas('engine_probe')) return Promise.resolve(false);
	const key = profileKey(backend);
	if (!force && Date.now() - (loadProfile(key).probedAt ?? 0) < PROBE_FRESH_MS) return Promise.resolve(false);
	let job = running.get(key);
	if (!job) {
		job = (async () => {
			const base = buildBackendOpts(backend);
			const options = { ...(base?.bin_override ? { bin: base.bin_override } : {}), ...(base?.env ? { env: base.env } : {}) };
			const reply = await daemon.request({ op: 'engine_probe', engine: backend, options, ...(force ? { force: true } : {}) });
			const patch = profileFromEvents(arr<Record<string, unknown>>(reply.events));
			rememberProfile(key, { ...patch, probedAt: Date.now() });
			return Object.keys(patch).length > 0;
		})()
			.catch(() => false)
			.finally(() => running.delete(key));
		running.set(key, job);
	}
	return job;
}

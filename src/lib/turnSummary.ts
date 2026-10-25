// What a finished turn leaves behind besides its changed files (the change
// pill under its reply, turnStats.ts), shown under its last row
// (MessageList, design.md "Workbench canvas"): the deliverables the agent
// presented (`present_files`), the scheduled tasks it proposed
// (`propose_schedule`) and the conversations it started (`start_session`).
// The two app tools have no tool row: they show only here, once the turn
// is over.
import type { Msg } from './chat.svelte';
import { parseToolOutput, toolFailed } from './toolSummary';
import type { Repeat } from './schedules';

export const USER_TOOLS = new Set(['present_files', 'propose_schedule']);

export interface Artifact {
	path: string;
	description: string;
	size: number;
	/** `image` and `video` show inline (the daemon reads them, `fs_image`). */
	kind: 'image' | 'video' | 'file';
}

export interface Proposal {
	/** Ties the card to the task created from it (the task's `origin`). */
	id: string;
	name: string;
	prompt: string;
	repeat: Repeat;
	time: string;
	days?: number[];
	date?: string;
}

/** Where a conversation the turn started is: the message sent to it
 *  (`delivered`, `queued`), answered (`replied`), waiting for the user to
 *  approve a step there (`waiting_approval`), or still at work (`running`). */
export type ChildStatus = 'queued' | 'delivered' | 'replied' | 'waiting_approval' | 'running';
const CHILD_STATUS: ChildStatus[] = ['queued', 'delivered', 'replied', 'waiting_approval', 'running'];

export interface ChildSession {
	session: string;
	title: string;
	/** The engine it was asked to run on ('' : the default, LynShen). */
	engine: string;
	status: ChildStatus | null;
}

export interface TurnSummary {
	artifacts: Artifact[];
	proposals: Proposal[];
	children: ChildSession[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const REPEATS: Repeat[] = ['once', 'hourly', 'daily', 'weekdays', 'weekly'];
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov)$/i;

/** A presented file's kind: the daemon's, else by its extension (an older
 *  daemon's card has none). */
export function artifactKind(path: string, kind?: unknown): Artifact['kind'] {
	if (kind === 'image' || kind === 'video' || kind === 'file') return kind;
	return IMAGE.test(path) ? 'image' : VIDEO.test(path) ? 'video' : 'file';
}

/** One finished call as the summary reads it; cached by its message while
 *  its output stays the same (a finished call's output does not change). */
type Item =
	| { kind: 'artifacts'; files: Artifact[] }
	| { kind: 'proposal'; proposal: Proposal }
	| { kind: 'child'; child: ChildSession }
	| { kind: 'wait'; session: string; status: ChildStatus | null }
	| null;
const items = new WeakMap<Msg, { output: string; item: Item }>();

function itemOf(m: Extract<Msg, { kind: 'tool' }>): Item {
	const known = items.get(m);
	if (known && known.output === m.output) return known.item;
	const item = readItem(m);
	items.set(m, { output: m.output, item });
	return item;
}

const status = (v: unknown): ChildStatus | null => (CHILD_STATUS.includes(v as ChildStatus) ? (v as ChildStatus) : null);

/** The calls the summary reads; the others are not parsed. */
const READ = new Set([...USER_TOOLS, 'start_session', 'wait_session']);

function readItem(m: Extract<Msg, { kind: 'tool' }>): Item {
	if (!READ.has(m.name)) return null;
	const parsed = parseToolOutput(m.output);
	if (!parsed || toolFailed(m, parsed)) return null;
	if (m.name === 'present_files') {
		const files = (Array.isArray(parsed.files) ? parsed.files : []).flatMap((f) => {
			const o = f && typeof f === 'object' ? (f as Record<string, unknown>) : null;
			const path = str(o?.path);
			return path ? [{ path, description: str(o?.description), size: num(o?.size), kind: artifactKind(path, o?.kind) }] : [];
		});
		return files.length ? { kind: 'artifacts', files } : null;
	}
	if (m.name === 'propose_schedule') {
		const repeat = str(parsed.repeat) as Repeat;
		if (!str(parsed.id) || !str(parsed.name) || !REPEATS.includes(repeat)) return null;
		const days = Array.isArray(parsed.days) ? parsed.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : undefined;
		return {
			kind: 'proposal',
			proposal: {
				id: str(parsed.id),
				name: str(parsed.name),
				prompt: str(parsed.prompt),
				repeat,
				time: str(parsed.time),
				...(days?.length ? { days } : {}),
				...(str(parsed.date) ? { date: str(parsed.date) } : {})
			}
		};
	}
	if (m.name === 'start_session') {
		const session = str(parsed.session);
		if (!session) return null;
		const args = parseToolOutput(m.args ?? '');
		return { kind: 'child', child: { session, title: str(parsed.title), engine: str(args?.engine), status: status(parsed.status) } };
	}
	if (m.name === 'wait_session') {
		const session = str(parsed.session);
		return session ? { kind: 'wait', session, status: status(parsed.status) } : null;
	}
	return null;
}

/** The summary of one turn's messages (null: nothing to show). */
export function turnSummary(turn: readonly Msg[]): TurnSummary | null {
	const artifacts = new Map<string, Artifact>();
	const proposals = new Map<string, Proposal>();
	const children = new Map<string, ChildSession>();
	for (const m of turn) {
		if (m.kind !== 'tool' || m.running) continue;
		const item = itemOf(m);
		if (!item) continue;
		if (item.kind === 'artifacts')
			for (const f of item.files) {
				// Presented again: the newer description, in its new place.
				artifacts.delete(f.path);
				artifacts.set(f.path, f);
			}
		else if (item.kind === 'proposal') proposals.set(item.proposal.id, item.proposal);
		else if (item.kind === 'child') children.set(item.child.session, { ...item.child });
		else if (item.kind === 'wait') {
			// A wait after the start says where it is now.
			const child = children.get(item.session);
			if (child && item.status) child.status = item.status;
		}
	}
	if (!artifacts.size && !proposals.size && !children.size) return null;
	return { artifacts: [...artifacts.values()], proposals: [...proposals.values()], children: [...children.values()] };
}

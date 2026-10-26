<script lang="ts">
	import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
	import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
	import FileTextIcon from 'phosphor-svelte/lib/FileTextIcon';
	import { fade } from 'svelte/transition';
	import Markdown from '$lib/Markdown.svelte';
	import ReasoningBody from '$lib/ReasoningBody.svelte';
	import Collapse from '$lib/ui/Collapse.svelte';
	import ToolCard from '$lib/ToolCard.svelte';
	import SubagentCard from '$lib/agents/SubagentCard.svelte';
	import AttemptGroupCard from '$lib/agents/AttemptGroupCard.svelte';
	import AgentMessageLine from '$lib/agents/AgentMessageLine.svelte';
	import EscalationLine from '$lib/sandbox/EscalationLine.svelte';
	import PlanCard, { type PlanAction } from '$lib/PlanCard.svelte';
	import CompactionCard from '$lib/CompactionCard.svelte';
	import FlowMarker from '$lib/FlowMarker.svelte';
	import RecapReceipt from '$lib/RecapReceipt.svelte';
	import ArtifactCards from '$lib/ArtifactCards.svelte';
	import ScheduleProposal from '$lib/ScheduleProposal.svelte';
	import ChildSessions from '$lib/ChildSessions.svelte';
	import { turnSummary, USER_TOOLS, type Proposal, type TurnSummary } from '$lib/turnSummary';
	import type { ApprovalMode } from '$lib/approval';
	import { attemptGroups, SPAWN_TOOLS, spawnAgentRow, WAIT_TOOLS, type AgentRow } from '$lib/agentProgress';
	import type { OpenHow } from '$lib/agents/subagentPages.svelte';
	import DeliveryNotice from '$lib/DeliveryNotice.svelte';
	import { parseDelivery } from '$lib/delivery';
	import { sendCardProps, sendCardView, type SessionMessageView } from '$lib/sessions/sessionMessage';
	import { ReplyStream, finishedBlocks, type Block } from '$lib/streamBlocks';
	import { diffStat, editedPaths, isEdit, parseToolOutput, toolFailed, toolIcon, toolTarget, toolVerb } from '$lib/toolSummary';
	import DiffStat from '$lib/DiffStat.svelte';
	import ToolTime from '$lib/ToolTime.svelte';
	import RunLight from '$lib/ui/RunLight.svelte';
	import Indicator from '$lib/Indicator.svelte';
	import CallTimer from '$lib/CallTimer.svelte';
	import RetryNotice from '$lib/RetryNotice.svelte';
	import ErrorNotice from '$lib/ErrorNotice.svelte';
	import type { ErrorAction, ErrorInfo } from '$lib/errorInfo';
	import { t } from '$lib/i18n';
	import type { CallTiming, Msg, RetryState } from '$lib/chat.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { fmtDur, turnParts } from '$lib/turnStats';
	import { turnFolds, type TurnFold } from '$lib/turnFold';
	import { SvelteSet } from 'svelte/reactivity';
	import { onDestroy, tick, untrack } from 'svelte';
	import UserImage from '$lib/UserImage.svelte';
	import SentFiles from '$lib/SentFiles.svelte';
	import { copyableText, splitAttachments } from '$lib/attachments';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import QuotesIcon from 'phosphor-svelte/lib/QuotesIcon';
	import ListPlusIcon from 'phosphor-svelte/lib/ListPlusIcon';
	import { copyText } from '$lib/clipboard';
	import { lastTurnStart, turnEnds, turnText } from '$lib/turnText';
	import { contextItems, type ContextItem } from '$lib/ui/contextMenu';
	import { streamText } from '$lib/streamText';
	import type { PlainSource } from '$lib/streamPlain';
	import { hasText, liveRead } from '$lib/liveText';

	let {
		messages,
		streamingMsg,
		streamingReasoning,
		phase,
		call = null,
		turnSince = 0,
		compactionTokens = 0,
		retry = null,
		autoRetry = null,
		onAutoRetryNow,
		onAutoRetryCancel,
		findActive = null,
		scroller,
		onEdit,
		onCite,
		onNote,
		onRewind,
		onFile,
		onAttachment,
		onDismiss,
		backend = '',
		provider = '',
		onErrorAction,
		planWaitUntil = null,
		onCancelPlanWait,
		traceOf,
		agents,
		onOpenAgent,
		onAgentChanges,
		onChanges,
		onOpenEdited,
		onMergeAgent,
		onStopAgent,
		onPickAttempt,
		attemptPicks = {},
		onPlan,
		onOpenPlan,
		planMode = 'edits',
		loadImage,
		sendOf,
		onOpenSession,
		busy = false,
		foldTurns = false,
		root = '',
		onReveal,
		onSchedule,
		onDeclineSchedule,
		scheduleState,
		mark = $bindable(-1)
	}: {
		messages: Msg[];
		streamingMsg: Msg | null;
		streamingReasoning: Msg | null;
		phase: string | null;
		/** The model request in flight, timed live (see CallTiming). */
		call?: CallTiming | null;
		/** When the running turn began (the status line's turn clock). */
		turnSince?: number;
		compactionTokens?: number;
		/** A failed model request being re-sent: shown instead of the phase. */
		retry?: RetryState | null;
		/** The app's retry of a failed turn, waiting (autoRetry.ts). */
		autoRetry?: RetryState | null;
		onAutoRetryNow?: () => void;
		onAutoRetryCancel?: () => void;
		findActive?: number | null;
		// The scroll viewport (owned by +page). When provided (null until the
		// host has bound it) and the history is long, rows outside the viewport
		// are windowed out.
		scroller?: HTMLElement | null;
		/** Puts a sent message back in the composer; without it there is no pencil. */
		/** `files`: the message's attachments other than images. */
		onEdit?: (text: string, files?: string[]) => void;
		/** Quote text selected in a reply into the composer. */
		onCite?: (text: string) => void;
		/** Notes the selected passage as a requirement (offered beside quoting). */
		onNote?: (text: string) => void;
		/** Rewinds to a sent message and puts it back to rewrite; without it
		 *  there is no rewind button (a read-only transcript, an engine that
		 *  cannot rewind). */
		onRewind?: (text: string, userIndex: number, files?: string[]) => void;
		/** Open a workspace file referenced by a chat link (editor / browser). */
		/** A file link in a message; `context` is that message's text. */
		onFile?: (href: string, context?: string) => void;
		/** Opens a file a user message sent (absent: its chip only shows it). */
		onAttachment?: (path: string, files: string[]) => void;
		/** Remove a message the user closed (error notices). */
		onDismiss?: (m: Msg) => void;
		/** The session's engine, for reading its errors. */
		backend?: string;
		/** The LynShen engine's provider (see ErrorNotice). */
		provider?: string;
		/** An error notice's fix (restart, sign in, compact …). */
		onErrorAction?: (action: ErrorAction, info: ErrorInfo) => void;
		/** The turn the plan stopped waits for its window (planStop.svelte.ts):
		 *  when it goes on; the last error notice shows it. */
		planWaitUntil?: number | null;
		onCancelPlanWait?: () => void;
		/** A tool call whose run the agent trace shows (claude's Agent / Workflow). */
		traceOf?: (m: Msg) => { label: string; run: () => void } | null;
		/** The conversation's subagents: spawn and wait calls render as their
		 *  cards (absent: plain tool rows). */
		agents?: AgentRow[];
		/** Shows a subagent's own conversation. */
		onOpenAgent?: (row: AgentRow, how: OpenHow) => void;
		/** Shows a worktree subagent's changes. */
		onAgentChanges?: (row: AgentRow) => void;
		/** Merges a worktree subagent's changes into the project, or drops them. */
		onMergeAgent?: (row: AgentRow, action: 'apply' | 'discard') => void;
		/** Stops a subagent still at work (close_agent). */
		onStopAgent?: (row: AgentRow) => void;
		/** Best-of-N: merges the attempt picked, discards the others. */
		onPickAttempt?: (group: string, row: AgentRow) => void;
		/** The attempt picked in each group (ChatState.attemptPicks). */
		attemptPicks?: Record<string, string>;
		/** Approves or revises a proposed plan (absent: plans have no actions). */
		onPlan?: (id: string, action: PlanAction) => void;
		/** The mode a plan's approval offers first. */
		/** Shows a plan in its page beside the chat. */
		onOpenPlan?: (id: string) => void;
		planMode?: ApprovalMode;
		/** Reads a sent image where the desktop can't open its path (the remote page). */
		loadImage?: (path: string) => Promise<string>;
		/** The message a send_to_session call sent (ChatState.sendOf). */
		sendOf?: (callId: string) => SessionMessageView | undefined;
		/** Opens a conversation by its session id (another conversation's
		 *  message opens the one it came from). */
		onOpenSession?: (session: string) => void;
		/** Ordinal of the user message in view: at or above the upper third. */
		mark?: number;
		/** Shows the project's changes in the Git panel: the end of a turn's
		 *  list of changed files. */
		onChanges?: () => void;
		/** Opens a file the turn that `reply` ends changed, with that turn's
		 *  changes (absent: as a file). */
		onOpenEdited?: (path: string, reply: Msg) => void;
		/** The session's folder: a changed file shows relative to it. */
		root?: string;
		/** The last turn still runs, or waits on work it handed off: it does
		 *  not fold yet. */
		busy?: boolean;
		/** A finished turn folds its work into one line (turnFold.ts). */
		foldTurns?: boolean;
		/** Shows a deliverable in the file manager (absent: no button). */
		onReveal?: (path: string) => void;
		/** Opens the task dialog for a proposed scheduled task (absent: the
		 *  card only shows it). */
		onSchedule?: (proposal: Proposal) => void;
		/** Sets a proposal aside (absent: no 不用了). */
		onDeclineSchedule?: (proposal: Proposal) => void;
		/** Whether a task was created from proposal `id`, or it was set aside. */
		scheduleState?: (id: string) => 'created' | 'declined' | null;
	} = $props();

	// ── Virtual list (dynamic-height windowing) ─────────────────────────────
	// Only long histories are windowed; short conversations render in full so the
	// streaming/auto-scroll path is completely untouched. Heights are measured per
	// message (cached by object identity) with an estimate for not-yet-seen rows.
	const VIRTUAL_MIN = 40; // messages before windowing engages
	const EST_ROW = 120; // px estimate for an unmeasured row of no known kind
	const GAP = 16; // px, matches .list gap
	const OVERSCAN = 800; // px rendered beyond the viewport on each side

	// Weak: a replaced transcript's messages are not kept alive by their heights.
	const heights = new WeakMap<Msg, number>();
	let measureVersion = $state(0);
	let scrollTop = $state(0);
	let viewH = $state(0);
	let atEnd = $state(true);
	// The list's top within the scroller's content (the scroller's padding).
	let listTop = $state(0);
	let listEl: HTMLElement;
	let raf = 0;

	// The viewport has been read since it was bound (see `range`).
	let placed = $state(false);

	// Track the viewport's scroll position + height. The first reading comes
	// with the observer's first report, in the next frame: by then the host
	// has put the view where the conversation opens (its end), and reading it
	// at once (the top) rendered the conversation's first rows for nothing.
	$effect(() => {
		const el = scroller;
		placed = false;
		if (!el) return;
		const sync = () => {
			scrollTop = el.scrollTop;
			viewH = el.clientHeight;
			atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
			cite = null;
			listTop = listEl.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
			placed = true;
		};
		el.addEventListener('scroll', sync, { passive: true });
		const ro = new ResizeObserver(sync);
		ro.observe(el);
		return () => {
			el.removeEventListener('scroll', sync);
			ro.disconnect();
		};
	});

	// A host that passes a scroller windows its rows from the start: its
	// scroller is bound after this list first renders (null until then), and
	// rendering every row of a long history until it is (each reply as
	// Markdown) took seconds and hundreds of MB on every open of a long
	// conversation, for rows dropped a moment later.
	const virtual = $derived(scroller !== undefined && messages.length >= VIRTUAL_MIN);

	// Cumulative top offset of each row (offsets[i] = top of row i, offsets[n] = end).
	const offsets = $derived.by(() => {
		measureVersion; // recompute when a measurement lands
		const offs = new Array(messages.length + 1);
		offs[0] = 0;
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			// Unshown placeholders occupy no row (and no gap).
			const h = shown(m) ? (heights.get(m) ?? estimate(m)) + GAP : 0;
			offs[i + 1] = offs[i] + h;
		}
		return offs;
	});
	const totalH = $derived(offsets[messages.length] ?? 0);

	/** An unmeasured row's height by its kind and length, so the window a
	 *  conversation opens with holds about a view of it: a folded turn or a
	 *  run of tool calls is one line, a reply as tall as its text. (One
	 *  guess for every row made the window hold twice the replies once
	 *  turns folded.) */
	function estimate(m: Msg): number {
		if (folds.head.has(m) && folded(m)) return 24;
		switch (m.kind) {
			case 'tool':
			case 'reasoning':
			case 'agent_message':
			case 'escalation':
			case 'system':
				return 28;
			case 'user':
				return 48 + 24 * Math.floor(m.text.length / 60);
			case 'assistant':
				return Math.min(2400, 40 + Math.round(m.text.length * 0.45));
			default:
				return EST_ROW;
		}
	}

	// [first, last] inclusive window of rows to render.
	const range = $derived.by(() => {
		if (!virtual) return { first: 0, last: messages.length - 1 };
		// No viewport read yet: the end (where a conversation opens), a
		// window's height of it and the overscan.
		if (!scroller || !placed) {
			const end = offsets[messages.length]!;
			const need = (typeof window === 'undefined' ? 800 : window.innerHeight) + OVERSCAN;
			let first = messages.length - 1;
			while (first > 0 && end - offsets[first]! < need) first--;
			return { first, last: messages.length - 1 };
		}
		const top = scrollTop - OVERSCAN;
		const bottom = scrollTop + viewH + OVERSCAN;
		let first = 0;
		while (first < messages.length && offsets[first + 1] < top) first++;
		let last = first;
		while (last < messages.length - 1 && offsets[last] < bottom) last++;
		return { first, last };
	});
	const windowRows = $derived(messages.slice(range.first, range.last + 1));
	// The rows windowed out are spacers, elements before and after the rows
	// (padding on the list would do the same): the browser anchors the view
	// to a row as a spacer changes height (scroll anchoring); it does not as
	// the list's padding changes, and rows measured above the view as the
	// reader scrolls up then moved the text under them.
	const padTop = $derived(virtual ? Math.max(0, offsets[range.first]! - GAP) : 0);
	const padBottom = $derived(virtual ? Math.max(0, totalH - offsets[range.last + 1]! - GAP) : 0);

	// Measure the rendered rows and cache their heights, coalescing recomputes
	// into one rAF. One observer for all rows: it reports a row once it is laid
	// out (reading its height as it mounts forced a layout per row), and again
	// when its size changes.
	const rowMsg = new WeakMap<Element, Msg>();
	const rowSizes =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver((entries) => {
					for (const e of entries) {
						const msg = rowMsg.get(e.target);
						const h = (e.target as HTMLElement).offsetHeight;
						if (!msg || h <= 0 || heights.get(msg) === h) continue;
						heights.set(msg, h);
						if (!raf)
							raf = requestAnimationFrame(() => {
								raf = 0;
								measureVersion++;
							});
					}
				});
	onDestroy(() => {
		rowSizes?.disconnect();
		cancelAnimationFrame(raf);
	});
	function measure(node: HTMLElement, msg: Msg) {
		rowMsg.set(node, msg);
		rowSizes?.observe(node);
		return {
			update(next: Msg) {
				if (rowMsg.get(node) === next) return;
				rowMsg.set(node, next);
				// Observed anew, it is reported (measured) again.
				rowSizes?.unobserve(node);
				rowSizes?.observe(node);
			},
			destroy() {
				rowSizes?.unobserve(node);
			}
		};
	}

	// Scroll the current find hit into view. Under windowing the row may be unrendered,
	// so scroll the viewport to the row's computed offset (which brings it into range).
	$effect(() => {
		if (findActive == null) return;
		// A hit inside a folded turn opens it.
		const fold = folds.of.get(messages[findActive]!);
		if (fold) untrack(() => openFolds.add(fold.key));
		const head = toolGroups.headOf.get(messages[findActive]!);
		if (head) untrack(() => openGroups.add(head));
		if (virtual && scroller) {
			scroller.scrollTo({ top: Math.max(0, offsets[findActive] - viewH / 2), behavior: 'smooth' });
		} else {
			rowEls[findActive]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}
	});
	let rowEls: (HTMLElement | null)[] = [];

	// Index in `messages` of each message the user wrote, in order: the rail's marks.
	const markRows = $derived(messages.flatMap((m, i) => (m.kind === 'user' && !parseDelivery(m.text) ? [i] : [])));
	$effect(() => {
		const rows = markRows;
		if (atEnd) {
			mark = rows.length - 1;
			return;
		}
		const line = scrollTop + viewH / 3 - listTop;
		let n = 0;
		while (n + 1 < rows.length && offsets[rows[n + 1]!]! <= line) n++;
		mark = rows.length ? n : -1;
	});

	/** Scroll mark `n`'s message to the top of the viewport. */
	export function jumpToMark(n: number) {
		const i = markRows[n];
		if (i === undefined || !scroller) return;
		const el = scroller;
		const alignRow = (behavior: ScrollBehavior) => {
			const row = rowEls[i];
			if (!row?.isConnected) return false;
			const top = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
			el.scrollTo({ top, behavior });
			return true;
		};
		if (alignRow('smooth')) return;
		// Windowed out: go to its estimated offset, which renders it, then align
		// on the real row once it has been measured.
		el.scrollTo({ top: listTop + offsets[i]! - 16 });
		requestAnimationFrame(() => requestAnimationFrame(() => alignRow('auto')));
	}

	// Map each user message to its 0-based ordinal so a rewind can target the
	// matching engine turn (the engine lists user turns in the same order).
	const userOrdinal = $derived.by(() => {
		const map = new Map<Msg, number>();
		let n = 0;
		for (const m of messages) if (m.kind === 'user') map.set(m, n++);
		return map;
	});

	// Selecting text in the replies (or their reasoning) offers to quote it;
	// a selection may run across several replies.
	let cite = $state<{ text: string; x: number; top: number; bottom: number } | null>(null);
	const replyOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest('.answer, .reason-body');
	function offerCite() {
		const sel = window.getSelection();
		const text = sel?.toString().trim();
		if (!onCite || !sel || sel.isCollapsed || !text) return;
		const range = sel.getRangeAt(0);
		const from = replyOf(range.startContainer);
		const to = replyOf(range.endContainer);
		if (!from || !to || !listEl.contains(from) || !listEl.contains(to)) return;
		const r = range.getBoundingClientRect();
		cite = { text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom };
	}
	function takeCite(to: ((text: string) => void) | undefined = onCite) {
		if (!cite) return;
		to?.(cite.text);
		window.getSelection()?.removeAllRanges();
		cite = null;
	}

	// Copying: a user message's text, or a whole turn's replies (every
	// assistant message since the user's, as Markdown) from the button on the
	// turn's last reply or the reply's context menu. The turn still running
	// offers neither.
	const liveFrom = $derived(streamingMsg || streamingReasoning || phase ? lastTurnStart(messages) : messages.length);
	// Up to the running turn only (it offers no copy): its reply's text is
	// not read on every delta.
	const ends = $derived(turnEnds(messages, liveFrom));
	let copied = $state<Msg | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function copy(text: string, mark: Msg | undefined) {
		if (!text || !(await copyText(text)) || !mark) return;
		copied = mark;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = null), 1400);
	}
	function copyTurn(i: number) {
		let end: Msg | undefined;
		for (let j = i; j < messages.length && messages[j]!.kind !== 'user'; j++) if (ends.has(messages[j]!)) end = messages[j];
		return copy(turnText(messages, i), end);
	}
	function turnMenu(i: number): ContextItem[] {
		if (i >= liveFrom || !turnText(messages, i)) return [];
		return [{ key: 'copy-turn', label: t('chat.copyTurn'), run: () => copyTurn(i) }];
	}

	// A sent message's state shows on its bubble; the bottom indicator would
	// say the same thing ("connecting"), so it stays quiet meanwhile.
	const sendingShown = $derived.by(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i]!;
			if (m.kind === 'user') return !!m.state && m.state !== 'failed';
		}
		return false;
	});
	// A running compaction card says it all; the line below it would repeat it.
	const compactionCard = $derived(messages.findLast((m) => m.kind !== 'system')?.kind === 'compaction');
	const shownPhase = $derived(
		(sendingShown && (phase === 'connecting' || phase === 'waiting')) || (phase === 'compacting' && compactionCard) ? null : phase
	);

	// Smoothing buffer: SSE deltas arrive in big bursts every few seconds, which
	// reads as jerky chunk-by-chunk output. Reveal the received text at an adaptive
	// pace so it flows continuously. `shown` chases the active message's length with
	// a proportional controller (speed grows with backlog, floored so it never
	// stalls while content is pending), integrated over real time.
	const REVEAL_TAU = 0.5; // s — backlog time constant (higher = smoother, more lag)
	const MIN_CPS = 60; // chars/s floor while streaming
	let shownChars = $state(0);
	let smoothing: Msg | null = null;
	const active = $derived<Msg | null>(streamingMsg ?? streamingReasoning);
	const textOf = (m: Msg | null) => (m && 'text' in m ? m.text : '');

	$effect(() => {
		if (!active) {
			shownChars = 0;
			smoothing = null;
			reply = null;
			return;
		}
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const cur = streamingMsg ?? streamingReasoning;
			if (!cur) return;
			if (cur !== smoothing) {
				smoothing = cur;
				shownChars = 0;
				last = now;
			}
			const len = textOf(cur).length;
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			const pending = len - shownChars;
			if (pending > 0) {
				const cps = Math.max(MIN_CPS, pending / REVEAL_TAU);
				shownChars = Math.min(len, shownChars + cps * dt);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});

	/** Text to show for a message — the smoothed reveal of the one currently
	 *  streaming — as a length and a reader for part of it, which reads the
	 *  streaming message from its deltas (liveText.ts): slicing its text would
	 *  copy all of it on every delta. */
	function shownText(m: Msg): PlainSource {
		const text = textOf(m);
		return { length: m === active ? Math.min(text.length, Math.floor(shownChars)) : text.length, read: liveRead(m, text) };
	}

	/** The end of streaming reasoning as one line: enough to overflow the
	 *  widest pane, so the line always ends at the newest word. */
	function reasoningTail(m: Msg): string {
		const { length, read } = shownText(m);
		return read(Math.max(0, length - 240), length).replace(/\s+/g, ' ').trimStart();
	}

	// Incremental streaming markdown: render completed blocks as markdown (each
	// chunk once, keyed) and the in-progress tail block as plain text. Per-frame
	// cost tracks what the frame reveals and the current block, not the whole
	// message (ReplyStream). The split never lands inside an open code fence.
	let reply: { m: Msg; stream: ReplyStream } | null = null;
	function streamingReply(m: Msg) {
		if (reply?.m !== m) reply = { m, stream: new ReplyStream() };
		const { length, read } = shownText(m);
		return reply.stream.update(length, read);
	}

	// A finished reply renders as the chunks it streamed in (finishedBlocks),
	// not as one document: the chunks rendered while it streamed stay as they
	// are, and only its tail renders as it finishes. Rendering it whole again
	// then cost time and memory that grew with the reply.
	const finished = new WeakMap<Msg, { text: string; blocks: Block[] }>();
	function replyBlocks(m: Msg & { text: string }): Block[] {
		const text = m.text;
		const done = finished.get(m);
		if (done?.text === text) return done.blocks;
		const blocks = finishedBlocks(text);
		finished.set(m, { text, blocks });
		return blocks;
	}

	// A user message's text split into runs of "> " quote lines (quoted
	// passages, shown as quotes) and the text between.
	function userBlocks(text: string): { text: string; quote: boolean }[] {
		const out: { text: string; quote: boolean }[] = [];
		for (const line of text.split('\n')) {
			const quote = /^>( |$)/.test(line);
			const last = out[out.length - 1];
			const body = quote ? line.replace(/^> ?/, '') : line;
			if (last?.quote === quote) last.text += `\n${body}`;
			else out.push({ text: body, quote });
		}
		// The blank lines around a quote are its spacing, not text.
		return out.map((b) => (b.quote ? b : { ...b, text: b.text.replace(/^\n+|\n+$/g, '') })).filter((b) => b.text);
	}

	// A user message's text with its [图片 #N] placeholders split out.
	function userSegments(text: string): { text: string; image?: string }[] {
		const out: { text: string; image?: string }[] = [];
		let last = 0;
		for (const m of text.matchAll(/\[图片 #(\d+)\]/g)) {
			if (m.index > last) out.push({ text: text.slice(last, m.index) });
			out.push({ text: m[0], image: m[1] });
			last = m.index + m[0].length;
		}
		if (last < text.length) out.push({ text: text.slice(last) });
		return out;
	}

	// Skip empty placeholders (e.g. an assistant message before its first delta).
	function hasContent(m: Msg): boolean {
		// A step of the conversation's course shows where it happened
		// (FlowMarker); other notes go to the notices strip.
		if (m.kind === 'system') return !!m.flow;
		// present_files / propose_schedule show in the turn's summary (turnSummary.ts).
		if (m.kind === 'tool') return !!(m.name || m.output) && !USER_TOOLS.has(m.name);
		if (m.kind === 'plan') return !!(m.title || m.text);
		if (m.kind === 'agent_message') return !!m.summary;
		if (m.kind === 'compaction' || m.kind === 'escalation' || m.kind === 'cut') return true;
		return !!m.text && hasText(m, m.text);
	}

	/** `hasContent` for the lists worked out over every message (the rows'
	 *  offsets, the runs of tool calls): a message that has content keeps it
	 *  (its text and output only grow in place; one let go of is a new
	 *  object), so only one without any is watched for some. Read whole, the
	 *  streaming message's text made each of them run again over the whole
	 *  conversation on every delta. */
	function contentful(m: Msg): boolean {
		return untrack(() => hasContent(m)) || hasContent(m);
	}

	// A run of consecutive tool calls (rows that show nothing don't break it),
	// with the thinking that led to each call, renders as one row on its first
	// member: one line naming what the run did, its line counts and its time,
	// then — expanded — the thinking (each one folded line) and the calls in
	// a tight list. The run's other members render no row of their own.
	// Thinking that no call follows (yet) stays a block of its own, and a
	// single call keeps its own row.
	const GROUP_MIN = 2;
	const toolGroups = $derived.by(() => {
		const members = new Map<Msg, Msg[]>(); // first member → the run
		const headOf = new Map<Msg, Msg>();
		let run: Msg[] = [];
		let calls = 0;
		let thoughts: Msg[] = [];
		const flush = () => {
			if (calls >= GROUP_MIN) {
				members.set(run[0]!, run);
				for (const x of run) headOf.set(x, run[0]!);
			}
			run = [];
			calls = 0;
			thoughts = [];
		};
		for (const m of messages) {
			if (!contentful(m)) continue;
			// A message to another conversation keeps a row of its own: its
			// state changes after the run.
			if (m.kind === 'tool' && !isAgentCall(m) && m.name !== 'send_to_session') {
				run.push(...thoughts, m);
				thoughts = [];
				calls++;
			} else if (m.kind === 'reasoning') thoughts.push(m);
			else flush();
		}
		// Thinking at the end leads to no call (yet): not in the run.
		flush();
		return { members, headOf };
	});
	const openGroups = new SvelteSet<Msg>();
	// The replies whose list of changed files is open (the change pill).
	const openChanges = new SvelteSet<Msg>();
	/** A changed file as the list names it: inside the session's folder,
	 *  relative to it. */
	function shownPath(path: string): string {
		const base = root.replace(/[\\/]+$/, '');
		return base && path.startsWith(base + '/') ? path.slice(base.length + 1) : path;
	}
	// The last message with something to show (a plan's actions show there only).
	const lastShown = $derived(messages.findLast((m) => hasContent(m)));
	const lastError = $derived(messages.findLast((m) => m.kind === 'error'));
	/** A spawn or wait call that renders as a subagent card. */
	function isAgentCall(m: Msg): boolean {
		return !!agents && m.kind === 'tool' && (SPAWN_TOOLS.has(m.name) || WAIT_TOOLS.has(m.name));
	}
	function shown(m: Msg): boolean {
		return contentful(m) && (!toolGroups.headOf.has(m) || toolGroups.members.has(m)) && !attempts.hidden.has(m) && (!folded(m) || folds.head.has(m));
	}
	// A finished turn's work folded into one line on its first row (the
	// thinking, tool calls and text before the final reply); a turn's open
	// state is kept by its user message.
	const folds = $derived.by(() => {
		const head = new Map<Msg, TurnFold>();
		const of = new Map<Msg, TurnFold>();
		if (foldTurns)
			for (const f of turnFolds(messages, contentful, busy)) {
				head.set(f.members[0]!, f);
				for (const m of f.members) of.set(m, f);
			}
		return { head, of };
	});
	const openFolds = new SvelteSet<Msg>();
	function folded(m: Msg): boolean {
		const f = folds.of.get(m);
		return !!f && !openFolds.has(f.key);
	}
	// A turn that ends while the reader reads further up stays open: its
	// work does not vanish from under them. The folds there when the list
	// first shows are folded.
	let foldsSeen: WeakSet<Msg> | null = null;
	$effect.pre(() => {
		const keys = [...folds.head.values()].map((f) => f.key);
		untrack(() => {
			const first = !foldsSeen;
			foldsSeen ??= new WeakSet();
			for (const k of keys) {
				if (foldsSeen.has(k)) continue;
				foldsSeen.add(k);
				if (!first && !atEnd) openFolds.add(k);
			}
		});
	});
	// Each finished turn's deliverables, proposed tasks and started
	// conversations, under its last row (its final reply, as a rule). Only
	// turns with such a call are looked at further.
	const SUMMARY_TOOLS = new Set([...USER_TOOLS, 'start_session']);
	const summaries = $derived.by(() => {
		const out = new Map<Msg, TurnSummary>();
		let from = -1;
		let has = false;
		const close = (to: number) => {
			if (!has || from < 0) return;
			const turn = messages.slice(from, to);
			const summary = turnSummary(turn);
			if (!summary) return;
			const last = turn.findLast((m) => shown(m)) ?? turn[0]!;
			out.set(last, summary);
		};
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i]!;
			if (m.kind === 'user' && !parseDelivery(m.text)) {
				close(i);
				from = i;
				has = false;
			} else if (m.kind === 'tool' && SUMMARY_TOOLS.has(m.name)) has = true;
		}
		// The running turn (or one waiting on work it handed off) has none yet.
		if (!busy) close(messages.length);
		return out;
	});
	/** The phone page reads them through `loadImage`; the desktop itself. */
	const canMedia = $derived(!!loadImage || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window));

	/** The fold line's first words: how long the turn took, else its steps. */
	function foldWords(f: TurnFold): string {
		return f.elapsed !== null ? t('chat.fold.worked', { t: fmtDur(f.elapsed) }) : t('chat.fold.steps', { n: f.calls });
	}
	// Best-of-N: the spawns of one attempt group render as one card, on the
	// group's first spawn; the others render nothing.
	const attempts = $derived.by(() => {
		const lead = new Map<Msg, { group: string; rows: AgentRow[] }>();
		const hidden = new Set<Msg>();
		if (!agents) return { lead, hidden };
		const groups = attemptGroups(agents);
		if (!groups.size) return { lead, hidden };
		const seen = new Set<string>();
		for (const m of messages) {
			if (m.kind !== 'tool' || !SPAWN_TOOLS.has(m.name)) continue;
			const group = spawnAgentRow(agents, m.callId, m.args ?? '', m.output)?.attemptGroup;
			if (!group) continue;
			if (seen.has(group)) hidden.add(m);
			else {
				seen.add(group);
				lead.set(m, { group, rows: groups.get(group) ?? [] });
			}
		}
		return { lead, hidden };
	});
	type ToolMsg = Extract<Msg, { kind: 'tool' }>;
	/** One call as a run's line reads it, kept while its output is the same:
	 *  a streaming call's updates parse only its own output again. */
	type CallFacts = { failed: boolean; edit: boolean; paths: string[]; stat: { add: number; del: number } | null };
	const callFacts = new WeakMap<Msg, { output: string; isError: boolean; facts: CallFacts }>();
	function factsOf(x: ToolMsg): CallFacts {
		const known = callFacts.get(x);
		if (known && known.output === x.output && known.isError === x.isError) return known.facts;
		const parsed = parseToolOutput(x.output);
		const failed = toolFailed(x, parsed);
		const edit = isEdit(x.name, parsed);
		const facts = { failed, edit, paths: edit && !failed ? editedPaths(parsed) : [], stat: edit && !failed ? diffStat(parsed) : null };
		callFacts.set(x, { output: x.output, isError: x.isError, facts });
		return facts;
	}
	/** A run's line: its calls, whether one runs, how many failed, the
	 *  latest call, and — for a run that only edits — the files it edited;
	 *  the lines its edits added and removed. */
	function groupInfo(run: Msg[]) {
		const tools = run.filter((x): x is ToolMsg => x.kind === 'tool');
		let running = false;
		let failed = 0;
		let onlyEdits = true;
		let add = 0;
		let del = 0;
		let counted = false;
		const files = new Set<string>();
		for (const x of tools) {
			const f = factsOf(x);
			if (x.running) running = true;
			if (f.failed) failed++;
			if (!f.edit) onlyEdits = false;
			for (const p of f.paths) files.add(p);
			if (f.stat) {
				counted = true;
				add += f.stat.add;
				del += f.stat.del;
			}
		}
		const edited = onlyEdits && files.size ? [...files].map((p) => p.split(/[\\/]/).pop() || p) : null;
		const last = tools[tools.length - 1];
		const latest = last && !edited ? { Icon: toolIcon(last.name), verb: toolVerb(last.name), target: toolTarget(last.name, parseToolOutput(last.output)) } : null;
		return { tools, running, failed, latest, edited, stat: counted ? { add, del } : null };
	}

	// The text under the view stays still as rows window in or out above it
	// and as their spacer takes their measured heights. The browser's scroll
	// anchoring does this, but WebKit leaves it undone after a scroll the
	// page made (the smooth mouse wheel's glide, a jump), and the view moved
	// by the difference between the rows' estimates and their heights (up to
	// 700 px a step). The first row in view is read before the window
	// changes and put back where it was after, unless the anchoring already
	// did it; at the end, the pane's following keeps the end in view.
	let anchorRow: { el: Element; top: number } | null = null;
	function readAnchor(): { el: Element; top: number } | null {
		const el = scroller;
		if (!el || !listEl || !virtual || atEnd) return null;
		const viewTop = el.getBoundingClientRect().top;
		for (const row of listEl.children) {
			if (!row.classList.contains('mwrap')) continue;
			const box = row.getBoundingClientRect();
			if (box.bottom > viewTop) return { el: row, top: box.top };
		}
		return null;
	}
	$effect.pre(() => {
		void padTop;
		void range.first;
		untrack(() => (anchorRow = readAnchor()));
	});
	$effect(() => {
		void padTop;
		void range.first;
		untrack(() => {
			const a = anchorRow;
			anchorRow = null;
			if (!a || !scroller || !a.el.isConnected) return;
			const drift = a.el.getBoundingClientRect().top - a.top;
			if (Math.abs(drift) >= 1) scroller.scrollTop += drift;
		});
	});

	// The status line's "›": the running call's card, opened (its run of
	// calls too) and brought into view.
	let revealed = $state<{ call: Msg; n: number } | null>(null);
	async function revealCall(call: Msg) {
		const head = toolGroups.headOf.get(call);
		if (head) openGroups.add(head);
		revealed = { call, n: (revealed?.n ?? 0) + 1 };
		await tick();
		rowEls[messages.indexOf(head ?? call)]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	const reveal = (m: Msg) => (revealed?.call === m ? revealed.n : 0);
</script>

<svelte:document onselectionchange={() => cite && window.getSelection()?.isCollapsed && (cite = null)} />

<div class="list" bind:this={listEl} onmouseup={(e) => e.button === 0 && setTimeout(offerCite)} role="presentation">
	{#if padTop > 0}<div class="spacer" style:height="{padTop}px"></div>{/if}
	{#each windowRows as m, k (m)}
		{@const i = range.first + k}
		{#if shown(m)}
			{@const fold = folds.head.get(m)}
			<div class="mwrap" class:animate={!virtual} class:turn={m.kind === 'user' && i > 0} class:hit={i === findActive} bind:this={rowEls[i]} use:measure={m}>
				{#if fold}
					{@const open = openFolds.has(fold.key)}
					<!-- A finished turn's work in one line: its time and the files it changed. -->
					<button class="fold" class:open onclick={() => (open ? openFolds.delete(fold.key) : openFolds.add(fold.key))} aria-expanded={open}>
						<span>{foldWords(fold)}</span>
						{#if fold.files}<span class="fold-files">{t('chat.fold.files', { n: fold.files })}<span class="mono add">+{fold.added}</span><span class="mono del">−{fold.removed}</span></span>{/if}
						<span class="rchev"><CaretRightIcon size={13} /></span>
					</button>
				{/if}
				{#if fold && !openFolds.has(fold.key)}
					<!-- Folded: the line is the whole row. -->
				{:else if toolGroups.members.has(m)}
					{@render toolRun(m, toolGroups.members.get(m)!)}
				{:else if m.kind === 'user'}
			{@const delivery = parseDelivery(m.text)}
			{@const drop = userOrdinal.size - (userOrdinal.get(m) ?? 0)}
			{#if delivery}
				<DeliveryNotice {delivery} {onOpenSession} />
			{:else}
			{@const listed = splitAttachments(m.text)}
			{@const sent = m.files?.length ? { ...listed, files: [...listed.files, ...m.files] } : listed}
			{@const hasBubble = !!sent.text || !!m.images?.length}
			<div class="row user" class:filed={hasBubble && (sent.files.length > 0 || sent.videos.length > 0)}>
				<button class="uedit ucopy" class:done={copied === m} onclick={() => copy(copyableText(m.text, m.files), m)} aria-label={t(copied === m ? 'common.copied' : 'common.copy')} title={t(copied === m ? 'common.copied' : 'common.copy')}>
					{#if copied === m}<CheckIcon size={12} />{:else}<CopyIcon size={12} />{/if}
				</button>
				{#if onRewind}
					<button class="uedit rewind" onclick={() => onRewind(m.text, userOrdinal.get(m) ?? 0, m.files)} aria-label={t('chat.rewindTitleN', { n: drop })} title={t('chat.rewindTitleN', { n: drop })}>
						<ArrowCounterClockwiseIcon size={12} />{#if drop > 1}<span class="rwn">{drop}</span>{/if}
					</button>
				{/if}
				{#if onEdit}
					<button class="uedit" onclick={() => onEdit(m.text, m.files)} aria-label={t('chat.quoteTitle')} title={t('chat.quoteTitle')}><PencilSimpleIcon size={12} /></button>
				{/if}
				<div class="ucol">
					<!-- Files and videos sent with it: chips above the bubble, which
					     shows what was typed (attachments.ts). -->
					{#if sent.files.length || sent.videos.length}<SentFiles files={sent.files} videos={sent.videos} onOpen={onAttachment} />{/if}
					<!-- One line: the bubble is pre-wrap, so template whitespace would show. -->
					{#if hasBubble}<div class="bubble" class:pending={m.state === 'sending'}>{#if m.images?.length}<div class="uimgs" class:alone={!sent.text}>{#each m.images as p (p)}<UserImage path={p} load={loadImage} group={m.images} />{/each}</div>{/if}{#each userBlocks(sent.text) as block, b (b)}{#if block.quote}<span class="uquote">{block.text}</span>{:else}<span class="utext">{#each userSegments(block.text) as seg, j (j)}{#if seg.image}<span class="utoken">{t('chat.imageToken', { n: seg.image })}</span>{:else}{seg.text}{/if}{/each}</span>{/if}{/each}</div>{/if}
					{#if m.state}
						{#key m.state}
							<div class="sendstate {m.state}" in:fade={{ duration: 160 }}>
								{#if m.state === 'failed'}<WarningCircleIcon size={13} />{:else}<span class="sdot"></span>{/if}
								<span>{t(`chat.send.${m.state}`)}</span>
								{#if call && (m.state === 'connecting' || m.state === 'waiting')}<CallTimer since={call.since} />{/if}
							</div>
						{/key}
					{/if}
				</div>
			</div>
			{/if}
		{:else if m.kind === 'assistant'}
			{@const r = m === streamingMsg ? streamingReply(m) : null}
			{@const blocks = r ? r.blocks : replyBlocks(m)}
			<div class="answer" use:contextItems={() => turnMenu(i)}>
				<!-- The same keyed chunks while it streams and once it has
				     finished: only the tail renders anew at its end. -->
				{#each blocks as block, b (block.key)}<Markdown text={block.text} more={!!r || b < blocks.length - 1} onFile={(href) => onFile?.(href, m.text)} />{/each}
				{#if r}
					<div class="stream" use:streamText={{ text: r.tail, from: r.split }}></div>
				{:else}
					{@const turnEnd = ends.has(m) && i < liveFrom}
					<!-- Only the turn's last reply carries the request's totals
					     and the copy button for the whole turn. -->
					{#if m.turn || m.elapsed || turnEnd || m.interrupted}
						<div class="foot">
							{#if m.interrupted}<span title={t('chat.interruptedTitle')}>{t('chat.interrupted')}</span>{/if}
							{#if m.turn}
								{#each turnParts(m.turn, prefs.turnStats) as part, j (j)}
									{#if part.change}
										<!-- The files the turn changed: a change pill that lists them under the reply. -->
										{@const listed = !!m.turn.changes?.length}
										<svelte:element this={listed ? 'button' : 'span'} class="change" class:open={listed} class:shown={openChanges.has(m)} title={listed ? t('chat.stat.listChanges') : part.title} aria-expanded={listed ? openChanges.has(m) : undefined} onclick={listed ? () => (openChanges.has(m) ? openChanges.delete(m) : openChanges.add(m)) : undefined} role={listed ? undefined : 'note'}
											><FileTextIcon size={14} /><span>{t('chat.stat.filesCount', { n: part.change.files })}</span><span class="add">+{part.change.added}</span><span class="del">−{part.change.removed}</span>{#if listed}<span class="rchev"><CaretRightIcon size={12} /></span>{/if}</svelte:element
										>
									{:else}
										<span class="stat" class:mono={part.mono} title={part.title}>{part.text}</span>
									{/if}
								{/each}
							{:else if m.elapsed}
								<span class="mono">{fmtDur(m.elapsed)}</span>
								{#if m.tokens}<span class="mono">{t('chat.tokens', { n: m.tokens })}</span>{/if}
							{/if}
							{#if turnEnd}
								<button class="tcopy" class:done={copied === m} onclick={() => copyTurn(i)} aria-label={t(copied === m ? 'common.copied' : 'chat.copyTurn')} title={t('chat.copyTurn')}>
									{#if copied === m}<CheckIcon size={13} /><span>{t('common.copied')}</span>{:else}<CopyIcon size={13} />{/if}
								</button>
							{/if}
						</div>
					{/if}
					{#if m.turn?.changes?.length}
						<Collapse open={openChanges.has(m)}>
							<!-- The turn's changed files: a click opens one; the last row shows the project's changes in Git. -->
							<div class="changed" aria-label={t('chat.stat.files')}>
								{#each m.turn.changes as f (f.path)}
									<button class="cfile" title={f.path} onclick={() => (onOpenEdited ? onOpenEdited(f.path, m) : onFile?.(f.path, m.text))}>
										<span class="cpath">{shownPath(f.path)}</span>
										<span class="mono add">+{f.added}</span><span class="mono del">−{f.removed}</span>
									</button>
								{/each}
								{#if onChanges}<button class="cfile cgit" onclick={onChanges}>{t('chat.stat.openGit')}</button>{/if}
							</div>
						</Collapse>
					{/if}
					{#if m.recap && m.recap.choice !== 'closed'}<RecapReceipt outcome={m.recap} />{/if}
				{/if}
			</div>
		{:else if m.kind === 'reasoning'}
			{@render reasoningRow(m)}
		{:else if m.kind === 'tool'}
			{#if agents && isAgentCall(m)}
				{@const attempt = attempts.lead.get(m)}
				{#if attempt}
					<AttemptGroupCard group={attempt.group} rows={attempt.rows} picked={attemptPicks[attempt.group] ?? ''} onOpen={onOpenAgent} onViewChanges={onAgentChanges} onPick={onPickAttempt} onStop={onStopAgent} />
				{:else}
					<SubagentCard name={m.name} callId={m.callId} output={m.output} args={m.args} running={m.running} isError={m.isError} rows={agents} onOpen={onOpenAgent} onViewChanges={onAgentChanges} onMerge={onMergeAgent} onStop={onStopAgent} />
				{/if}
			{:else if m.name === 'send_to_session'}
				{@const card = sendCardProps(sendCardView(m, sendOf?.(m.callId)), m.isError)}
				<ToolCard name={m.name} output={m.output} running={m.running} isError={m.isError} subagent={m.subagent} heading={card.heading} badge={card.badge} sections={card.sections} startedAt={m.startedAt} endedAt={m.endedAt} />
			{:else}
				<ToolCard name={m.name} output={m.output} running={m.running} isError={m.isError} subagent={m.subagent} trace={traceOf?.(m) ?? undefined} reveal={reveal(m)} startedAt={m.startedAt} endedAt={m.endedAt} onFile={onFile ? (href) => onFile(href) : undefined} />
			{/if}
		{:else if m.kind === 'compaction'}
			<CompactionCard stage={m.state} before={m.before} after={m.after} written={m.written} since={m.since} summary={m.summary} error={m.error} live={m.live} />
		{:else if m.kind === 'plan'}
			<PlanCard id={m.id} title={m.title} text={m.text} status={m.status} actionable={m === lastShown} defaultMode={planMode} onAction={onPlan} onOpen={onOpenPlan} />
		{:else if m.kind === 'agent_message'}
			<AgentMessageLine from={m.from} to={m.to} summary={m.summary} />
		{:else if m.kind === 'escalation'}
			<EscalationLine record={m.record} />
		{:else if m.kind === 'system' && m.flow}
			<FlowMarker flow={m.flow} text={m.text} />
		{:else if m.kind === 'cut'}
			<!-- The engine went away during the turn: it ends here, unfinished. -->
			<div class="cutmark" role="note" title={t('chat.cut.markerDetail')}>
				<WarningCircleIcon size={13} /><span>{t('chat.cut.marker')}</span><span class="cut-why">{t('chat.cut.markerDetail')}</span>
			</div>
		{:else if m.kind === 'error'}
			<ErrorNotice
				text={m.text}
				{backend}
				{provider}
				waitingUntil={m === lastError ? planWaitUntil : null}
				onAction={onErrorAction}
				onCancelWait={onCancelPlanWait}
				onDismiss={onDismiss ? () => onDismiss(m) : undefined}
			/>
				{/if}
				{#if summaries.has(m)}{@render summaryOf(summaries.get(m)!)}{/if}
			</div>
		{/if}
	{/each}
	{#if padBottom > 0}<div class="spacer" style:height="{padBottom}px"></div>{/if}
	{#if retry}
		<RetryNotice {retry} {backend} />
	{:else if autoRetry}
		<RetryNotice retry={autoRetry} {backend} onNow={onAutoRetryNow} onCancel={onAutoRetryCancel} />
	{:else}
		<Indicator phase={shownPhase} tokens={compactionTokens} {call} {messages} {turnSince} onDetails={revealCall} />
	{/if}
</div>
{#if cite}
	{@const below = cite.top < 60}
	<!-- mousedown would clear the selection before the click lands. -->
	<div class="cite" class:below style:left="{cite.x}px" style:top="{below ? cite.bottom + 8 : cite.top - 8}px">
		<button onmousedown={(e) => e.preventDefault()} onclick={() => takeCite()}>
			<QuotesIcon size={13} />{t('chat.cite')}
		</button>
		{#if onNote}
			<button onmousedown={(e) => e.preventDefault()} onclick={() => takeCite(onNote)}>
				<ListPlusIcon size={13} />{t('shell.requirement.note')}
			</button>
		{/if}
	</div>
{/if}

<!-- What a finished turn leaves (turnSummary.ts): the conversations it
     started, its deliverables (images and videos shown), the tasks it
     proposed. -->
{#snippet summaryOf(summary: TurnSummary)}
	{#if summary.children.length}<ChildSessions sessions={summary.children} onOpen={onOpenSession} />{/if}
	{#if summary.artifacts.length}<ArtifactCards files={summary.artifacts} onOpen={onFile ? (path) => onFile(path) : undefined} {onReveal} load={loadImage} media={canMedia} />{/if}
	{#each summary.proposals as p (p.id)}
		{@const state = scheduleState?.(p.id) ?? null}
		<ScheduleProposal proposal={p} created={state === 'created'} declined={state === 'declined'} onCreate={onSchedule} onDecline={onDeclineSchedule} />
	{/each}
{/snippet}

<!-- A thinking block: its head line (how long it thought), its latest words
     while it streams, its text opened. -->
{#snippet reasoningRow(m: Extract<Msg, { kind: 'reasoning' }>)}
	<div class="reason" class:open={!m.collapsed}>
		<div class="reason-row">
		<button class="reason-head" onclick={() => (m.collapsed = !m.collapsed)}>
			<span>
				{#if m.durationMs !== undefined}
					{t('chat.reasoningFor', { t: fmtDur(Math.max(1000, m.durationMs)) })}
				{:else if m === streamingReasoning && m.startedAt !== undefined}
					{t('chat.reasoningNow')} <CallTimer since={m.startedAt} />
				{:else}
					{t('chat.reasoning')}
				{/if}
				{#if m.interrupted}<span class="cut" title={t('chat.interruptedTitle')}>{t('chat.interrupted')}</span>{/if}
			</span>
			<span class="rchev"><CaretRightIcon size={13} /></span>
		</button>
		{#if m.collapsed && m === streamingReasoning}
			<!-- Folded while it streams: its latest words in one line,
			     the earliest sliding out to the left. -->
			<button class="reason-line" onclick={() => (m.collapsed = false)} aria-label={t('chat.reasoningExpand')}
				><span>{reasoningTail(m)}</span></button
			>
		{/if}
		</div>
		<Collapse open={!m.collapsed}>
			<div class="reason-body">
				<!-- Plain text while it streams (no per-frame Markdown), in
				     blocks written once; Markdown once finished, taking
				     over from the plain text a few chunks each frame. -->
				<ReasoningBody source={shownText(m)} text={m.text} live={m === streamingReasoning} onFile={(href) => onFile?.(href, m.text)} />
			</div>
		</Collapse>
	</div>
{/snippet}

<!-- A run of tool calls as one line (design.md, "Workbench canvas"): what it
     did — "已编辑 2 个文件 · a.ts, b.ts" for edits only, else the count and
     its latest call — its failures, its line counts (rolling while an edit
     streams) and its time; opened, the thinking and the calls in order. -->
{#snippet toolRun(m: Msg, run: Msg[])}
	{@const g = groupInfo(run)}
	{@const open = openGroups.has(m)}
	<button class="tgroup" class:open onclick={() => (open ? openGroups.delete(m) : openGroups.add(m))} aria-expanded={open}>
		<span class="tg-what">
			{#if g.edited}
				<span class="tg-count">{t('chat.editedFiles', { n: g.edited.length })}</span>
				<span class="tg-latest tg-names">{g.edited.join(', ')}</span>
			{:else}
				<span class="tg-count">{t('chat.toolGroup', { n: g.tools.length })}</span>
				{#if g.latest && !open}
					<span class="tg-latest">
						<g.latest.Icon size={13} />
						<span class="tg-verb">{g.latest.verb}</span>
						{#if g.latest.target}<span class="tg-target">{g.latest.target}</span>{/if}
					</span>
				{/if}
			{/if}
			{#if g.running}<RunLight />{/if}
		</span>
		{#if g.failed}<span class="tg-fail">{t('chat.toolGroupFailed', { n: g.failed })}</span>{/if}
		{#if g.stat}<DiffStat add={g.stat.add} del={g.stat.del} live={g.running} />{/if}
		<ToolTime spans={g.tools} />
		<span class="rchev"><CaretRightIcon size={13} /></span>
	</button>
	{#if open}
		<div class="tg-list">
			{#each run as x (x)}
				{#if x.kind === 'tool'}<ToolCard name={x.name} output={x.output} running={x.running} isError={x.isError} subagent={x.subagent} trace={traceOf?.(x) ?? undefined} reveal={reveal(x)} startedAt={x.startedAt} endedAt={x.endedAt} onFile={onFile ? (href) => onFile(href) : undefined} />
				{:else if x.kind === 'reasoning'}{@render reasoningRow(x)}{/if}
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.cite {
		position: fixed;
		z-index: 300;
		transform: translate(-50%, -100%);
		display: inline-flex;
		border-radius: var(--r-sm);
		border: 1px solid var(--border);
		background: var(--panel);
		box-shadow: var(--shadow-pop);
		overflow: hidden;
		animation: cite-in var(--t-fast) var(--ease-out);
	}
	.cite button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-xs);
		cursor: pointer;
		transition: background var(--t-fast) var(--ease-out);
	}
	.cite button + button {
		border-left: 1px solid var(--border);
	}
	.cite.below {
		transform: translateX(-50%);
	}
	.cite button:hover {
		background: var(--surface2);
	}
	@keyframes cite-in {
		from {
			opacity: 0;
		}
	}
	.list {
		font-family: var(--font-chat);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	/* Never let a flex column squeeze an item below its content height — that
	   collapses tool cards into stray horizontal lines under content pressure. */
	.list > :global(*) {
		flex-shrink: 0;
	}
	/* The rows windowed out (see padTop): never the view's scroll anchor. */
	.spacer {
		overflow-anchor: none;
	}
	.mwrap {
		border-radius: var(--r-md);
		transition: background var(--t-slow) var(--ease-out), box-shadow var(--t-slow) var(--ease-out);
	}
	/* New rows come in once: fade and rise over --t-enter. Suppressed under
	   windowing so rows scrolling back into the window don't replay. Fill
	   backwards only: a fill that held the end would leave every row
	   transformed (by an identity matrix) for good, the containing block of
	   its fixed children (a menu's click-away backdrop would cover only its
	   row) and, in Chromium, a compositing layer whose paint time grows with
	   a streaming row's text. The end values are the row's own, so nothing
	   moves when the animation lets go. */
	.mwrap.animate {
		animation: msg-in var(--t-enter) var(--ease-enter) backwards;
	}
	.mwrap.hit {
		background: var(--accent-soft);
		background-clip: content-box;
		box-shadow: 0 0 0 6px var(--accent-soft);
	}
	/* Spacing (design.md, "Workbench canvas"): 16px between the blocks of a
	   turn (the list's gap), 32px above the user message that starts a new
	   one. Padding, not margin: the windowing measures it with the row. */
	.mwrap.turn {
		padding-top: 16px;
	}
	.row {
		display: flex;
	}
	.row.user {
		justify-content: flex-end;
		align-items: center;
		gap: 6px;
	}
	/* Files above the bubble: the actions sit beside the bubble's last line,
	   not halfway up the files. */
	.row.user.filed {
		align-items: flex-end;
	}
	.row.user.filed .uedit {
		margin-bottom: 12px;
	}
	.uedit {
		opacity: 0;
		transform: translateX(4px);
		display: inline-flex;
		padding: 4px;
		border: none;
		background: none;
		color: var(--dim2);
		border-radius: var(--r-sm);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			opacity var(--t-med) var(--ease-out),
			transform var(--t-med) var(--ease-out),
			background var(--t-fast) var(--ease-out),
			color var(--t-fast) var(--ease-out);
	}
	.row.user:hover .uedit,
	.uedit:focus-visible {
		opacity: 1;
		transform: translateX(0);
	}
	.uedit:hover {
		background: var(--surface2);
		color: var(--text);
	}
	.uedit:active {
		transform: scale(0.9);
	}
	.uedit.rewind {
		gap: 2px;
		align-items: center;
	}
	.uedit.done,
	.tcopy.done {
		opacity: 1;
		transform: none;
		color: var(--ok);
	}
	.rwn {
		font-size: var(--fs-2xs);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	/* The user's message: a right-aligned bubble, at most 85% of the column. */
	.ucol {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		max-width: 85%;
		min-width: 0;
	}
	.bubble.pending {
		opacity: 0.7;
	}
	/* A turn the engine left unfinished: one quiet line where it ended, with
	   a hairline before it (the composer offers 继续). */
	.cutmark {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0 2px;
		border-top: 1px solid var(--hairline);
		color: var(--warn);
		font-size: var(--fs-xs);
	}
	.cut-why {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--dim2);
	}
	.sendstate {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding-right: 6px;
		color: var(--dim2);
		font-size: var(--fs-2xs);
	}
	.sendstate.failed {
		color: var(--err, var(--warn));
	}
	.sdot {
		position: relative;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--dim);
	}
	/* sending: the dot breathes; connecting: it sends out rings (the handshake
	   with the gateway); waiting: steady, connected. */
	.sending .sdot {
		animation: sbreathe 1.2s ease-in-out infinite;
	}
	.connecting .sdot {
		background: var(--accent-bright);
	}
	.connecting .sdot::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		border: 1.5px solid var(--accent-bright);
		animation: sring 1.3s ease-out infinite;
	}
	.waiting .sdot {
		background: var(--accent-bright);
	}
	@keyframes sbreathe {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes sring {
		0% {
			transform: scale(1);
			opacity: 0.7;
		}
		100% {
			transform: scale(2.8);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sdot,
		.sdot::after {
			animation: none !important;
		}
	}
	.stat + .stat::before {
		content: '·';
		margin-right: 10px;
		opacity: 0.6;
	}
	.foot .stat + .stat {
		margin-left: -2px;
	}
	.bubble {
		background: var(--surface2);
		border-radius: var(--r-xl);
		padding: 10px 14px;
		font-size: var(--fs-md);
		line-height: 24px;
		white-space: pre-wrap;
		word-break: break-word;
		max-width: 100%;
	}
	.uimgs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}
	.uimgs.alone {
		margin-bottom: 0;
	}
	.uquote,
	.utext {
		display: block;
	}
	.uquote {
		position: relative;
		padding: 5px 10px 5px 29px;
		border-radius: var(--r-md);
		background: color-mix(in oklab, var(--text) 5%, transparent);
		color: var(--dim);
	}
	.uquote::before {
		content: '';
		position: absolute;
		left: 10px;
		top: calc(5px + 0.8em - 6px);
		width: 12px;
		height: 12px;
		background: var(--dim2);
		mask: var(--quote-mask) center / contain no-repeat;
	}
	.uquote + .utext,
	.utext + .uquote,
	.uquote + .uquote {
		margin-top: 8px;
	}
	.utoken {
		padding: 0 5px;
		border-radius: var(--r-xs);
		background: var(--surface2);
		box-shadow: inset 0 0 0 1px var(--border-strong);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	/* The assistant's text sits bare on the canvas. */
	.answer {
		font-size: var(--fs-md);
		line-height: 24px;
		word-break: break-word;
	}
	.stream {
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 24px;
	}
	/* A reply reads as one document: a drag selects across its Markdown
	   blocks, the tail still streaming and the replies around it, and the
	   user's message likewise; buttons and stats stay out of the selection. */
	.answer,
	.stream,
	.ucol {
		-webkit-user-select: text;
		user-select: text;
	}
	.foot,
	.sendstate,
	.answer :global(button) {
		-webkit-user-select: none;
		user-select: none;
	}
	/* Copies the whole turn: quiet until the row is hovered. */
	.tcopy {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 5px;
		margin: -3px 0;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim2);
		font: inherit;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--t-med) var(--ease-out),
			background var(--t-fast) var(--ease-out),
			color var(--t-fast) var(--ease-out),
			transform var(--t-fast) var(--ease-out);
	}
	.tcopy:first-child {
		margin-left: -5px;
	}
	.mwrap:hover .tcopy,
	.tcopy:focus-visible {
		opacity: 1;
	}
	.tcopy:hover {
		background: var(--surface2);
		color: var(--text);
	}
	.tcopy:active {
		transform: scale(0.94);
	}
	/* Touch screens (the phone page) have no hover: a message's buttons
	   (copy, rewind, put back) stay, as the turn's copy button does. */
	@media (hover: none) {
		.tcopy,
		.uedit {
			opacity: 1;
			transform: none;
		}
	}
	/* The turn's summary line: duration, tokens, cost, in mono. */
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		margin-top: 6px;
		font-size: var(--fs-xs);
		line-height: 16px;
		color: var(--dim2);
	}
	.mono {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	/* A change pill: the files the turn changed, +added −removed. An
	   outlined --r-md chip, not a full pill. */
	.change {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
	.change :global(svg) {
		color: var(--dim);
	}
	.change .add,
	.change .del {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.change .add {
		color: var(--ok);
	}
	.change .del {
		color: var(--err);
	}
	button.change {
		cursor: pointer;
		transition: background var(--t-fast) var(--ease-base);
	}
	button.change:hover {
		background: var(--surface2);
	}
	.change .rchev {
		margin-left: -2px;
	}
	.change.shown .rchev {
		transform: rotate(90deg);
	}
	/* The turn's changed files under its reply: one 24px row each, the
	   path in mono (relative to the session's folder), its line counts. */
	.changed {
		display: flex;
		flex-direction: column;
		margin-top: 6px;
		padding-bottom: 2px;
	}
	.cfile {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 24px;
		padding: 2px 8px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-xs);
		line-height: 16px;
		text-align: left;
		cursor: pointer;
		transition:
			background var(--t-fast) var(--ease-out),
			color var(--t-fast) var(--ease-out);
	}
	.cfile:hover {
		background: var(--surface2);
		color: var(--text);
	}
	.cpath {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
	}
	.cfile .add {
		color: var(--ok);
	}
	.cfile .del {
		color: var(--err);
	}

	.reason-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.reason-head {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0;
		border: none;
		background: none;
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 16px;
		cursor: pointer;
	}
	.reason-head {
		transition: color var(--t-fast) var(--ease-out);
	}
	.reason-head:hover {
		color: var(--text);
	}
	.reason-head .cut {
		margin-left: 6px;
		color: var(--dim2);
		font-size: var(--fs-2xs);
		font-weight: 400;
	}
	.rchev {
		display: inline-flex;
		color: var(--dim2);
		transition: transform var(--t-base) var(--ease-base);
	}
	.reason.open .rchev,
	.tgroup.open .rchev,
	.fold.open .rchev {
		transform: rotate(90deg);
	}
	/* A finished turn's work folded into one line (turnFold.ts): --fs-xs
	   --dim like a tool call, no card; its figures in mono. Opened, it heads
	   the work it folds. */
	.fold {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		padding: 2px 0;
		border: none;
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-xs);
		line-height: 16px;
		text-align: left;
		cursor: pointer;
		transition: color var(--t-fast) var(--ease-out);
	}
	.fold:hover {
		color: var(--text);
	}
	.fold.open {
		margin-bottom: 12px;
	}
	.fold-files {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}
	.fold-files::before {
		content: '·';
		margin-right: 2px;
		opacity: 0.6;
	}
	.fold .add {
		color: var(--ok);
	}
	.fold .del {
		color: var(--err);
	}
	/* A run of tool calls: one summary line (--fs-xs --dim, no card): what
	   it did (the running light over it while a call runs), failures, line
	   counts, time. */
	.tgroup {
		--row-bg: var(--bg);
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-height: 24px;
		margin-left: -6px;
		text-align: left;
		padding: 2px 6px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 16px;
		cursor: pointer;
		transition:
			color var(--t-fast) var(--ease-base),
			background var(--t-fast) var(--ease-base);
	}
	.tgroup:hover {
		--row-bg: color-mix(in srgb, var(--text) 6%, var(--bg));
		background: var(--surface2);
		color: var(--text);
	}
	.tg-what {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		overflow: hidden;
	}
	.tg-names {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
	}
	.tg-count,
	.tg-fail {
		flex-shrink: 0;
		white-space: nowrap;
	}
	/* The latest call, in the card's own format, trailing the count. */
	.tg-latest {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--dim2);
	}
	.tg-latest::before {
		content: '·';
	}
	.tg-latest :global(svg) {
		flex-shrink: 0;
	}
	.tg-verb {
		flex-shrink: 0;
	}
	.tg-target {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}
	.tgroup .rchev,
	.tgroup :global(.spin) {
		flex-shrink: 0;
	}
	.tg-fail {
		color: var(--err);
	}
	/* The group's calls hang indented under its header, 4px apart. */
	.tg-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 4px 0 0 20px;
	}
	/* One line, anchored at its end: overflowing text leaves on the left,
	   where it fades out. */
	.reason-line {
		flex: 1;
		min-width: 0;
		display: flex;
		justify-content: flex-end;
		overflow: hidden;
		padding: 2px 0;
		border: none;
		background: none;
		color: var(--dim2, var(--dim));
		font: inherit;
		font-size: var(--fs-xs);
		font-style: italic;
		white-space: nowrap;
		text-align: left;
		cursor: pointer;
		-webkit-mask-image: linear-gradient(to right, transparent, #000 56px);
		mask-image: linear-gradient(to right, transparent, #000 56px);
		animation: reason-line-in var(--t-med) var(--ease-out);
	}
	.reason-line > span {
		flex: none;
	}
	.reason-line:hover {
		color: var(--dim);
	}
	@keyframes reason-line-in {
		from {
			opacity: 0;
		}
	}
	.reason-body {
		margin-top: 4px;
		color: var(--dim);
		font-style: italic;
		font-size: var(--fs-sm);
		line-height: 20px;
		word-break: break-word;
	}
	.foot .stat {
		white-space: nowrap;
	}
</style>

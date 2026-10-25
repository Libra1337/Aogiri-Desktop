<script lang="ts">
	// Messages sent while a turn runs, waiting in the daemon (`pending_messages`),
	// inside the composer box above the text as the other trays are. One row
	// per message, in the order they will run. A row can go into the running
	// turn (`join`: the engine takes it in once a running tool ends; the tool
	// is not cut), stop the turn and go now (`interrupt`), come back to the
	// message box (`takeBack`), be dropped (`drop`), or change places (`move`:
	// its handle drags, or ↑ ↓ while the handle has focus). The first `fixed`
	// are with the engine already (Claude Code): they only show. A daemon
	// before the queue ops gets the old single "run the first one now"
	// (`steerFirst`). The heading folds the list. Shared by the desktop
	// composer and the phone page (`touch`: larger rows, actions always shown).
	import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeftIcon';
	import ArrowSquareUpIcon from 'phosphor-svelte/lib/ArrowSquareUpIcon';
	import ArrowElbowDownRightIcon from 'phosphor-svelte/lib/ArrowElbowDownRightIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import DotsSixVerticalIcon from 'phosphor-svelte/lib/DotsSixVerticalIcon';
	import FastForwardIcon from 'phosphor-svelte/lib/FastForwardIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { sentLabel } from '$lib/attachments';
	import { t } from '$lib/i18n';
	import { dropPlace, stepPlace, type QueueAction, type QueueActions } from './queue';

	let {
		messages,
		fixed = 0,
		actions,
		busy,
		steering = null,
		toolRunning = false,
		joinKey = '',
		interruptKey = '',
		touch = false,
		onAction,
		onSteerFirst
	}: {
		messages: string[];
		fixed?: number;
		actions: QueueActions;
		/** A turn runs: joining or stopping it is offered only then. */
		busy: boolean;
		/** The message on its way into the turn (`status: steering`), shown
		 *  first until the engine reads it. */
		steering?: string | null;
		/** A tool runs: a steered message waits for it. */
		toolRunning?: boolean;
		/** ⌘↵ and ⌘⇧↵, for the tooltips. */
		joinKey?: string;
		interruptKey?: string;
		touch?: boolean;
		onAction: (action: QueueAction) => void;
		onSteerFirst?: () => void;
	} = $props();

	let folded = $state(false);
	const count = $derived(messages.length + (steering ? 1 : 0));
	const fixedN = $derived(Math.min(fixed, messages.length));
	const movable = $derived(actions.move && messages.length - fixedN > 1);

	// Dragging a row by its handle: it follows the pointer, the others slide
	// aside to show where it lands (never above the fixed ones).
	let listEl = $state<HTMLElement | null>(null);
	let drag = $state<{ from: number; at: number; dy: number; size: number } | null>(null);
	function grab(e: PointerEvent, from: number) {
		if (e.button !== 0 || !listEl || !movable) return;
		e.preventDefault();
		const rows = [...listEl.querySelectorAll<HTMLElement>('[data-qrow]')];
		const rects = rows.map((el) => el.getBoundingClientRect());
		const centres = rects.map((r) => r.top + r.height / 2);
		const startY = e.clientY;
		drag = { from, at: from, dy: 0, size: rects[from]?.height ?? 0 };
		const move = (ev: PointerEvent) => {
			if (!drag) return;
			drag.dy = ev.clientY - startY;
			drag.at = dropPlace(centres, from, (centres[from] ?? 0) + drag.dy, fixedN);
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
			const d = drag;
			drag = null;
			if (d && d.at !== d.from) onAction({ kind: 'move', index: d.from, to: d.at });
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
	}
	function shiftOf(i: number): number {
		if (!drag) return 0;
		if (i === drag.from) return drag.dy;
		if (i > drag.from && i <= drag.at) return -drag.size;
		if (i < drag.from && i >= drag.at) return drag.size;
		return 0;
	}
	/** ↑ ↓ on a focused handle move its row; focus follows it. */
	function onGripKey(e: KeyboardEvent, i: number) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		e.stopPropagation();
		const to = stepPlace(i, e.key === 'ArrowUp' ? -1 : 1, messages.length, fixedN);
		if (to === null) return;
		onAction({ kind: 'move', index: i, to });
		queueMicrotask(() => listEl?.querySelectorAll<HTMLElement>('[data-qrow] .grip')[to]?.focus());
	}
	const tip = (label: string, key: string) => (key ? `${label} · ${key}` : label);
	// Keeps focus in the message box when a row's button is clicked.
	const keep = (e: MouseEvent) => e.preventDefault();
</script>

<div class="qtray" class:touch>
	<div class="qhead">
		<button type="button" class="qfold" onmousedown={keep} onclick={() => (folded = !folded)} aria-expanded={!folded}>
			<span class="qtitle">{t('chat.queue.heading')}</span>
			<span class="qcount">{count}</span>
			<span class="qchev" class:folded><CaretDownIcon size={12} /></span>
		</button>
		{#if actions.join && busy}
			<span class="qmeta">{t('chat.queue.joinNote')}</span>
		{/if}
		{#if actions.steerFirst && busy && messages.length}
			<button type="button" class="qgo head" onmousedown={keep} onclick={onSteerFirst} title={t('chat.steerTitle')}><FastForwardIcon size={13} />{t('chat.steerAction')}</button>
		{/if}
	</div>
	{#if !folded}
		<div class="qlist" class:dragging={!!drag} role="list" aria-label={t('chat.queue.heading')} bind:this={listEl}>
			{#if steering}
				<div class="qrow" role="listitem">
					<span class="grip off" aria-hidden="true"><ArrowElbowDownRightIcon size={14} /></span>
					<span class="qtext" title={sentLabel(steering)}>{sentLabel(steering)}</span>
					<span class="qstate steering">{t(toolRunning ? 'chat.queue.steeringWait' : 'chat.queue.steeringNow')}</span>
				</div>
			{/if}
			{#each messages as q, i (i)}
				<div class="qrow" class:held={drag?.from === i} class:fixed={i < fixedN} style:transform={shiftOf(i) ? `translateY(${shiftOf(i)}px)` : undefined} role="listitem" data-qrow>
					{#if i < fixedN}
						<span class="grip off" aria-hidden="true"><DotsSixVerticalIcon size={14} /></span>
						<span class="qtext" title={sentLabel(q)}>{sentLabel(q)}</span>
						<span class="qstate">{t('chat.queue.fixed')}</span>
					{:else}
						{#if movable}
							<span
								class="grip"
								role="button"
								tabindex="0"
								aria-label={t('chat.queue.move')}
								title={t('chat.queue.moveTitle')}
								onpointerdown={(e) => grab(e, i)}
								onkeydown={(e) => onGripKey(e, i)}><DotsSixVerticalIcon size={14} /></span
							>
						{:else}
							<span class="grip off" aria-hidden="true"><DotsSixVerticalIcon size={14} /></span>
						{/if}
						<span class="qtext" title={sentLabel(q)}>{sentLabel(q)}</span>
						<span class="qacts">
							{#if actions.takeBack}
								<button type="button" class="qicon" onmousedown={keep} onclick={() => onAction({ kind: 'unqueue', index: i })} title={t('chat.unqueueTitle')} aria-label={t('chat.queue.takeBack')}>
									<ArrowUUpLeftIcon size={14} />
								</button>
							{/if}
							{#if busy && actions.join}
								<button type="button" class="qgo" onmousedown={keep} onclick={() => onAction({ kind: 'steer', index: i })} title={tip(t('chat.queue.joinTitle'), i === messages.length - 1 ? joinKey : '')}>
									<ArrowElbowDownRightIcon size={14} />{t('chat.queue.join')}
								</button>
							{/if}
							{#if busy && actions.interrupt}
								<button type="button" class="qgo" class:solo={!actions.join} onmousedown={keep} onclick={() => onAction({ kind: 'interrupt', index: i })} title={tip(t('chat.queue.interruptTitle'), i === messages.length - 1 ? interruptKey : '')} aria-label={actions.join ? t('chat.queue.interrupt') : undefined}>
									<ArrowSquareUpIcon size={14} />{#if !actions.join || touch}{t('chat.queue.interrupt')}{/if}
								</button>
							{/if}
							{#if actions.drop}
								<button type="button" class="qicon" onmousedown={keep} onclick={() => onAction({ kind: 'discard', index: i })} title={t('chat.queue.drop')} aria-label={t('chat.queue.drop')}>
									<XIcon size={14} />
								</button>
							{/if}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Inside the composer's box, above the text, as ComposerTray. */
	.qtray {
		margin-right: -10px;
		padding: 6px 6px 6px;
		border-bottom: 1px solid var(--hairline);
		animation: rise var(--t-med) var(--ease-out);
	}
	.qhead {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 24px;
		padding: 0 4px 4px 8px;
	}
	.qfold {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: none;
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 600;
		cursor: pointer;
	}
	.qcount {
		color: var(--dim2);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.qchev {
		display: inline-flex;
		color: var(--dim2);
		transition: transform var(--t-fast) var(--ease-out);
	}
	.qchev.folded {
		transform: rotate(-90deg);
	}
	.qmeta {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--dim2);
		font-size: var(--fs-2xs);
	}
	.qlist {
		max-height: min(196px, 30vh);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.qlist.dragging {
		user-select: none;
	}
	.qlist.dragging .qrow {
		transition: transform var(--t-fast) var(--ease-out);
	}
	.qlist.dragging .qrow.held {
		position: relative;
		z-index: 1;
		background: var(--surface2);
		transition: none;
	}
	.qrow {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 30px;
		padding: 1px 4px;
		border-radius: var(--r-sm);
		transition: background var(--t-fast) var(--ease-out);
	}
	.qrow:hover {
		background: var(--surface2);
	}
	.grip {
		display: inline-flex;
		flex-shrink: 0;
		padding: 2px;
		border-radius: var(--r-xs);
		color: var(--dim2);
		cursor: grab;
		outline: none;
	}
	.grip:focus-visible {
		color: var(--text);
		box-shadow: 0 0 0 1px var(--border-strong);
	}
	.grip.off {
		cursor: default;
		opacity: 0.5;
	}
	.qlist.dragging .grip {
		cursor: grabbing;
	}
	.qtext {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		font-size: var(--fs-sm);
	}
	.qrow.fixed .qtext {
		color: var(--dim);
	}
	.qstate {
		flex-shrink: 0;
		padding: 0 6px;
		color: var(--dim2);
		font-size: var(--fs-xs);
	}
	.qstate.steering {
		color: var(--accent-bright);
	}
	.qacts {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity var(--t-fast) var(--ease-out);
	}
	.qrow:hover .qacts,
	.qrow:focus-within .qacts,
	.touch .qacts {
		opacity: 1;
	}
	.qgo,
	.qicon {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		height: 24px;
		padding: 0 7px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-xs);
		cursor: pointer;
		transition:
			background var(--t-fast) var(--ease-out),
			color var(--t-fast) var(--ease-out),
			transform var(--t-fast) var(--ease-out);
	}
	.qicon {
		width: 24px;
		padding: 0;
		justify-content: center;
	}
	.qgo:hover,
	.qicon:hover,
	.qgo:focus-visible,
	.qicon:focus-visible {
		background: color-mix(in oklab, var(--text) 8%, transparent);
		color: var(--text);
	}
	.qgo:active,
	.qicon:active {
		transform: scale(0.97);
	}
	.qgo.head {
		margin-left: auto;
		color: var(--accent-bright);
	}
	/* The phone: rows a thumb can hit, actions always there. */
	.touch .qrow {
		min-height: 40px;
	}
	.touch .qgo,
	.touch .qicon {
		height: 32px;
	}
	.touch .qicon {
		width: 32px;
	}
	.touch .grip {
		padding: 6px 2px;
		touch-action: none;
	}
</style>

<script lang="ts">
	// A session's TUI on the phone page: the computer runs it, and this page
	// views it (several clients may at once). Leaving the page only detaches;
	// a dropped connection attaches again once the computer is back, with the
	// latest screen replayed. Acks keep a fast TUI from flooding a slow link
	// (daemonTerminal.ts: 512 KiB unacked at most). A phone without the
	// terminal permission watches read-only: no keys, and its size is not
	// the TUI's. Touch keyboards lack Esc, Tab, Ctrl and the arrows, so a row
	// of them sits under the terminal.
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import '@xterm/xterm/css/xterm.css';
	import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import EyeIcon from 'phosphor-svelte/lib/EyeIcon';
	import Button from '$lib/ui/Button.svelte';
	import { terminalLook, useTerminalInput, useWebgl } from '$lib/terminal';
	import { DaemonTerminal } from '$lib/daemonTerminal';
	import { useHost } from './connection.svelte';
	import { t } from '$lib/i18n';

	let {
		term: termProp = '',
		session,
		force = false,
		readOnly = false,
		onGone
	}: {
		/** The terminal to view (the session's `surface` names it). */
		term?: string;
		/** Without `term`: move this session into its TUI (`session_tui`). */
		session?: string;
		force?: boolean;
		/** This phone may not type into it (no `terminal` scope). */
		readOnly?: boolean;
		/** The terminal could not be opened or no longer exists. */
		onGone: (error?: string) => void;
	} = $props();

	const { daemon, agents } = useHost();
	let host = $state<HTMLDivElement | null>(null);
	let xterm: Terminal | undefined;
	let fit: FitAddon | undefined;
	let phase = $state<'attaching' | 'running' | 'slow' | 'away' | 'ended'>('attaching');
	let ctrl = $state(false);
	let disposed = false;
	const cleanups: (() => void)[] = [];

	const view = new DaemonTerminal(
		daemon,
		{
			reset: () => xterm?.reset(),
			output: (bytes, done) => (xterm ? xterm.write(bytes, done) : done()),
			exit: () => (phase = 'ended'),
			// `slow`: this phone fell behind; `disconnected`: the connection
			// dropped and comes back on its own.
			detached: (reason) => (phase = reason === 'slow' ? 'slow' : 'away')
		},
		true
	);

	async function attach(first = false) {
		if (!xterm || disposed) return;
		phase = 'attaching';
		try {
			const known = view.term || untrack(() => termProp);
			// Read-only: the daemon keeps the TUI's own size.
			await view.attach(
				known
					? { term: known, cols: xterm.cols, rows: xterm.rows }
					: { session: untrack(() => session), cols: xterm.cols, rows: xterm.rows, force: untrack(() => force) }
			);
			if (disposed) return view.detach();
			phase = 'running';
			if (first && !readOnly) xterm.focus();
		} catch (e) {
			if (disposed) return;
			phase = 'ended';
			onGone(e instanceof Error ? e.message : String(e));
		}
	}

	// Back after a dropped connection.
	$effect(() => {
		if (agents.status === 'on' && phase === 'away') untrack(() => void attach());
	});

	/** Typed keys, with Ctrl from the row applied to the next letter. */
	function input(data: string) {
		if (phase !== 'running' || readOnly) return;
		if (ctrl && data.length === 1) {
			ctrl = false;
			const code = data.toUpperCase().charCodeAt(0);
			if (code >= 64 && code < 96) data = String.fromCharCode(code - 64);
		}
		view.input(data).catch(() => {});
	}
	function arrow(key: 'A' | 'B' | 'C' | 'D') {
		input(`${xterm?.modes.applicationCursorKeysMode ? '\x1bO' : '\x1b['}${key}`);
		xterm?.focus();
	}
	function key(data: string) {
		input(data);
		xterm?.focus();
	}

	onMount(() => {
		xterm = new Terminal({ ...terminalLook(), cursorBlink: !readOnly, disableStdin: readOnly, allowProposedApi: true });
		fit = new FitAddon();
		xterm.loadAddon(fit);
		if (host) xterm.open(host);
		cleanups.push(useTerminalInput(xterm));
		useWebgl(xterm);
		fit.fit();
		xterm.onData(input);
		xterm.onResize(({ cols, rows }) => {
			if (phase === 'running' && !readOnly) view.resize(cols, rows);
		});
		const ro = new ResizeObserver(() => {
			try {
				fit?.fit();
			} catch {
				/* not laid out */
			}
		});
		if (host) ro.observe(host);
		cleanups.push(() => ro.disconnect());
		void attach(true);
	});

	$effect(() => {
		const look = terminalLook();
		if (!xterm) return;
		Object.assign(xterm.options, look);
		fit?.fit();
	});

	onDestroy(() => {
		disposed = true;
		// The TUI goes on without this page.
		view.detach();
		cleanups.forEach((f) => f());
		xterm?.dispose();
	});
</script>

<div class="termview" class:readonly={readOnly}>
	<div class="term-host" bind:this={host}></div>
	{#if phase !== 'running'}
		<div class="state" role="status">
			{#if phase === 'slow'}
				<span>{t('chat.terminalSlow')}</span>
				<Button size="sm" onclick={() => attach()}>{t('shell.remote.reconnect')}</Button>
			{:else if phase === 'ended'}
				<span>{t('chat.terminalEnded')}</span>
			{:else}
				<CircleNotchIcon size={14} class="spin" />
			{/if}
		</div>
	{/if}
	{#if readOnly}
		<p class="ro" role="note"><EyeIcon size={14} /><span>{t('chat.terminalReadOnly')}</span></p>
	{:else}
		<div class="keys">
			<button class="key" onclick={() => key('\x1b')}>Esc</button>
			<button class="key" onclick={() => key('\t')}>Tab</button>
			<button class="key" class:on={ctrl} aria-pressed={ctrl} onclick={() => ((ctrl = !ctrl), xterm?.focus())}>Ctrl</button>
			<span class="grow"></span>
			<button class="key" aria-label={t('chat.arrowLeft')} onclick={() => arrow('D')}><CaretLeftIcon size={16} /></button>
			<button class="key" aria-label={t('chat.arrowUp')} onclick={() => arrow('A')}><CaretUpIcon size={16} /></button>
			<button class="key" aria-label={t('chat.arrowDown')} onclick={() => arrow('B')}><CaretDownIcon size={16} /></button>
			<button class="key" aria-label={t('chat.arrowRight')} onclick={() => arrow('C')}><CaretRightIcon size={16} /></button>
		</div>
	{/if}
</div>

<style>
	.termview {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}
	.term-host {
		flex: 1;
		min-height: 0;
		background: var(--panel);
	}
	:global(.termview .xterm) {
		height: 100%;
		padding: 6px 4px 4px 8px;
	}
	:global(.termview .xterm-viewport) {
		background: transparent !important;
	}
	.state {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--hairline);
		background: var(--surface);
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	.keys,
	.ro {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		padding: 6px 8px calc(env(safe-area-inset-bottom) + 6px);
		border-top: 1px solid var(--hairline);
		background: var(--surface);
	}
	.ro {
		gap: 8px;
		color: var(--dim);
		font-size: var(--fs-xs);
		line-height: 1.5;
	}
	.ro :global(svg) {
		flex-shrink: 0;
	}
	.key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
		height: 36px;
		padding: 0 8px;
		border: none;
		border-radius: var(--r-sm);
		background: var(--surface2);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		touch-action: manipulation;
	}
	.key.on {
		background: var(--accent);
		color: var(--on-accent);
	}
	.grow {
		flex: 1;
	}
</style>

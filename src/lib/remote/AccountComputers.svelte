<script lang="ts">
	// The phone page's 账号 part (relay v2): signed out, one line on why and
	// a button to sign in with the LynShen account (the gateway's device
	// flow, approved in a new tab); signing in, the code to match on the
	// approval page; signed in, the account's computers (refreshed every
	// 30 s while shown) with whether each is online, 连接 (a connect request
	// the computer's user allows, or straight in when this browser is let in
	// already), rename and remove.
	import { onDestroy, onMount } from 'svelte';
	import DesktopIcon from 'phosphor-svelte/lib/DesktopIcon';
	import SignInIcon from 'phosphor-svelte/lib/SignInIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import DotsThreeIcon from 'phosphor-svelte/lib/DotsThreeIcon';
	import Button from '$lib/ui/Button.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import { t } from '$lib/i18n';
	import { remoteAccount, type Computer } from './account.svelte';

	let {
		connected,
		onConnect,
		onRemoved
	}: {
		/** Host ids this page has a connection to now (paired, or let in). */
		connected: string[];
		/** Connect to (or show) a computer of the account. */
		onConnect: (computer: Computer) => void;
		/** A computer left the account here. */
		onRemoved: (hostId: string) => void;
	} = $props();

	const REFRESH_MS = 30_000;
	let timer: ReturnType<typeof setInterval> | null = null;
	let menu = $state<string | null>(null);
	const step = $derived(remoteAccount.signIn);

	function refresh() {
		if (!remoteAccount.signedIn || document.visibilityState === 'hidden') return;
		remoteAccount.refresh().catch(() => {});
	}
	onMount(() => {
		refresh();
		timer = setInterval(refresh, REFRESH_MS);
		// A sign-in started before a reload.
		void remoteAccount.resume();
	});
	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	function signIn() {
		// The approval page opens in a new tab; this page polls meanwhile.
		void remoteAccount.start((url) => window.open(url, '_blank', 'noopener'));
	}

	const PLATFORMS: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
	function seen(c: Computer): string {
		if (c.online) return t('shell.remote.account.online');
		if (!c.last_seen_at) return t('shell.remote.account.offline');
		return t('shell.remote.account.lastSeen', { time: new Date(c.last_seen_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) });
	}

	async function rename(c: Computer) {
		menu = null;
		const next = prompt(t('shell.remote.account.renamePrompt'), c.name);
		if (next === null || !next.trim()) return;
		try {
			await remoteAccount.rename(c.host_id, next);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		}
	}

	async function remove(c: Computer) {
		menu = null;
		if (!confirm(t('shell.remote.account.removeConfirm', { name: c.name }))) return;
		try {
			await remoteAccount.remove(c.host_id);
			onRemoved(c.host_id);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		}
	}
</script>

<section class="account" aria-label={t('shell.remote.account.title')}>
	{#if !remoteAccount.signedIn}
		{#if step.kind === 'waiting'}
			<p class="lead">{t('shell.remote.account.approveHint')}</p>
			<p class="code" aria-label={t('shell.remote.account.codeLabel', { code: step.userCode })}>{step.userCode}</p>
			<p class="status"><CircleNotchIcon size={14} class="spin" /> {t('shell.remote.account.signingIn')}</p>
			<div class="row">
				<Button size="sm" onclick={() => window.open(step.url, '_blank', 'noopener')}>{t('shell.remote.account.openApproval')}</Button>
				<Button size="sm" variant="ghost" onclick={() => remoteAccount.cancel()}>{t('shell.remote.account.cancel')}</Button>
			</div>
		{:else}
			<p class="lead">{t('shell.remote.account.signInHint')}</p>
			<Button variant="primary" disabled={step.kind === 'starting'} onclick={signIn}>
				{#if step.kind === 'starting'}<CircleNotchIcon size={16} class="spin" />{:else}<SignInIcon size={16} />{/if}
				{t('shell.remote.account.signIn')}
			</Button>
			{#if step.kind === 'failed'}
				<Notice>{t(`shell.remote.account.failed.${step.reason}`, { message: step.message })}</Notice>
			{/if}
		{/if}
	{:else}
		<div class="head">
			<span class="who">{t('shell.remote.account.signedInAs', { name: remoteAccount.user?.username || remoteAccount.user?.email || '' })}</span>
		</div>
		{#if !remoteAccount.loaded && !remoteAccount.error}
			<p class="status"><CircleNotchIcon size={14} class="spin" /> {t('shell.remote.account.loading')}</p>
		{:else if remoteAccount.computers.length === 0}
			<p class="none">{remoteAccount.error ? remoteAccount.error : t('shell.remote.account.none')}</p>
		{:else}
			<ul class="computers">
				{#each remoteAccount.computers as c (c.host_id)}
					<li>
						<span class="ico"><DesktopIcon size={20} /></span>
						<span class="main">
							<span class="name">{c.name}</span>
							<span class="meta">
								<span class="dot" class:ok={c.online}></span>
								{[PLATFORMS[c.platform] ?? c.platform, seen(c)].filter(Boolean).join(' · ')}
							</span>
						</span>
						<Button size="sm" variant={connected.includes(c.host_id) ? 'ghost' : 'primary'} disabled={!c.online && !connected.includes(c.host_id)} onclick={() => onConnect(c)}>
							{connected.includes(c.host_id) ? t('shell.remote.account.open') : t('shell.remote.account.connect')}
						</Button>
						<span class="more">
							<button class="icon" aria-label={t('shell.remote.more')} aria-haspopup="menu" aria-expanded={menu === c.host_id} onclick={() => (menu = menu === c.host_id ? null : c.host_id)}><DotsThreeIcon size={18} /></button>
							{#if menu === c.host_id}
								<button class="backdrop" aria-label={t('common.close')} tabindex="-1" onclick={() => (menu = null)}></button>
								<div class="pop" role="menu">
									<button class="pop-row" role="menuitem" onclick={() => rename(c)}><span class="pop-txt"><span class="pop-label">{t('shell.remote.rename')}</span></span></button>
									<button class="pop-row warn" role="menuitem" onclick={() => remove(c)}><span class="pop-txt"><span class="pop-label">{t('shell.remote.account.remove')}</span></span></button>
								</div>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="migrate">{t('shell.remote.account.migration')}</p>
	{/if}
</section>

<style>
	.account {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 18px 0 6px;
		text-align: left;
	}
	.lead,
	.none,
	.migrate {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--dim);
		line-height: 1.55;
	}
	.migrate {
		font-size: var(--fs-xs);
		color: var(--dim2);
	}
	.code {
		margin: 4px 0;
		font-family: var(--font-mono);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-align: center;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--dim);
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--fs-xs);
		color: var(--dim2);
	}
	.computers {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--hairline);
	}
	.computers li {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 56px;
		border-bottom: 1px solid var(--hairline);
	}
	.ico {
		display: inline-flex;
		color: var(--dim);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: var(--fs-md);
		font-weight: 500;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-xs);
		color: var(--dim2);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--dim2);
		flex-shrink: 0;
	}
	.dot.ok {
		background: var(--ok);
	}
	.more {
		position: relative;
	}
	.icon {
		display: inline-flex;
		padding: 6px;
		border: none;
		border-radius: var(--r-sm);
		background: none;
		color: var(--dim);
		cursor: pointer;
	}
	.icon:hover {
		background: var(--surface2);
		color: var(--text);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: none;
		background: none;
	}
	.pop {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 21;
		min-width: 160px;
	}
</style>

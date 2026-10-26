<script lang="ts">
	// The phone page's account part (relay v2) for the browser regressions
	// and screenshots: the sign-in, the account's computers and a connect
	// request waiting for the computer. The gateway is the test's
	// (Playwright routes https://www.lynshen.org).
	//   ?remoteAccount           signed out: 用 LynShen 账号登录
	//   &signedIn                signed in (a key kept): the computers
	//   &waiting                 a computer asked to let this browser in
	//                            (its 6-digit code, the countdown)
	//   &refused=denied|expired|no_desktop
	//                            the computer refused the request
	import AccountComputers from '../../src/lib/remote/AccountComputers.svelte';
	import HostView from '../../src/lib/remote/HostView.svelte';
	import { HostConnection } from '../../src/lib/remote/connection.svelte';
	import { refusalError } from '../../src/lib/relay/socket';
	import Toaster from '../../src/lib/ui/Toaster.svelte';
	import ConfirmHost from '../../src/lib/ui/ConfirmHost.svelte';
	import { setLocale } from '../../src/lib/i18n';
	import type { Computer } from '../../src/lib/remote/account.svelte';

	const params = new URL(location.href).searchParams;
	setLocale(params.get('lang') === 'en' ? 'en' : 'zh');
	const opened: string[] = [];
	Object.assign(window, { __opened: opened });
	const asking = params.has('waiting') || params.has('refused');

	// A computer of the account the page asked (never connects here).
	let conn = $state<HostConnection | null>(null);
	if (asking) {
		const c = new HostConnection('H'.repeat(22), 'relay', async () => ({ url: 'ws://relay', token: '' }), () => {
			throw new Error('no relay in the fixture');
		});
		c.account = true;
		c.everConnected = false;
		if (params.has('waiting')) {
			c.waiting = true;
			c.waitingSince = Date.now();
			c.checkCode = '482913';
		} else c.relayError = refusalError(params.get('refused') ?? 'denied', false);
		conn = c;
	}
	const screens = { RemoteSession: null, FilesScreen: null, ChangesScreen: null };
	function open(c: Computer) {
		opened.push(c.host_id);
	}
</script>

{#snippet switcher()}<span class="conn">MacBook Pro</span>{/snippet}
{#snippet resizer()}{/snippet}

<Toaster />
<ConfirmHost />
<div class="remote">
	{#if conn}
		<HostView {conn} name="MacBook Pro" hidden={false} wide={false} {screens} {switcher} {resizer} onAdd={() => opened.push('pairing')} onForget={() => opened.push('forget')} onRepair={() => {}} />
	{:else}
		<div class="pair">
			<h1>你的电脑</h1>
			<AccountComputers connected={params.has('paired') ? ['H'.repeat(22)] : []} onConnect={open} onRemoved={(id) => opened.push(`removed:${id}`)} />
		</div>
	{/if}
</div>

<style>
	.remote {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-sans);
	}
	.pair {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-width: 420px;
		margin: 0 auto;
		padding: 48px 20px;
	}
	h1 {
		margin: 4px 0 0;
		font-size: var(--fs-xl);
		font-weight: 600;
	}
</style>

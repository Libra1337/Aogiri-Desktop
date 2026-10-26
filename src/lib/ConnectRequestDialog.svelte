<script lang="ts">
	// 「<device> 请求连接这台电脑」 for the oldest open connect request (relay
	// v2), over whatever the window shows: the device's kind, the 6-digit code
	// its screen shows too, the seconds left of the daemon's 120 s, and
	// 拒绝 / 允许. It goes when decided here, or when the daemon closes the
	// request (decided on another window, expired, or the device gave up).
	import { onDestroy } from 'svelte';
	import DeviceMobileIcon from 'phosphor-svelte/lib/DeviceMobileIcon';
	import Modal from '$lib/ui/Modal.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/ui/toast.svelte';
	import { clientKind, connectRequests, secondsLeft, type ConnectRequests } from '$lib/connectRequests.svelte';
	import { t } from '$lib/i18n';

	/** The app's requests (another daemon's in tests). */
	let { requests = connectRequests }: { requests?: ConnectRequests } = $props();

	const request = $derived(requests.open[0]);
	const kind = $derived(clientKind(request?.client));
	let now = $state(Date.now());
	const tick = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(tick));
	const left = $derived(request ? secondsLeft(request, now) : 0);

	// A second click (or an Enter) meant for this request must not answer the
	// next one, which takes this one's place under the pointer.
	let deciding = $state(false);

	function decide(allow: boolean) {
		if (!request || deciding) return;
		deciding = true;
		requests
			.decide(request.id, allow)
			.catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
			.finally(() => setTimeout(() => (deciding = false), 400));
	}
</script>

{#if request}
	<!-- No closing it without an answer: the request stays open on the computer.
	     Keyed so each request opens afresh, focus on 拒绝. -->
	{#key request.id}
		<Modal label={t('shell.connectRequest.label')} width={420} dismissible={false} onClose={() => {}}>
			<div class="request">
				<span class="hero"><DeviceMobileIcon size={22} /></span>
				<h2>{t('shell.connectRequest.title', { name: request.name || (kind ? t(kind) : t('shell.connectRequest.device')) })}</h2>
				<p class="kind">{kind ? `${t(kind)} · ` : ''}{t('shell.connectRequest.account')}</p>
				{#if request.check}
					<p class="check" aria-label={t('shell.connectRequest.checkLabel', { code: request.check })}>
						{request.check.slice(0, 3)}<span class="gap"></span>{request.check.slice(3)}
					</p>
					<p class="hint">{t('shell.connectRequest.checkHint')}</p>
				{/if}
				<p class="left" aria-live="off">{t('shell.connectRequest.left', { s: String(left) })}</p>
			</div>
			<!-- No autofocus on 允许: the dialog can open while the user is typing,
			     and an Enter meant for the composer must not let a device in. -->
			{#snippet footer()}
				<Button variant="ghost" disabled={deciding} onclick={() => decide(false)}>{t('shell.connectRequest.deny')}</Button>
				<Button variant="primary" disabled={deciding} onclick={() => decide(true)}>{t('shell.connectRequest.allow')}</Button>
			{/snippet}
		</Modal>
	{/key}
{/if}

<style>
	.request {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
	}
	.hero {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		margin-bottom: 4px;
		border-radius: var(--r-full);
		background: var(--surface2);
		color: var(--text);
	}
	h2 {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.kind,
	.hint,
	.left {
		margin: 0;
		color: var(--dim);
		font-size: var(--fs-sm);
		line-height: 1.55;
	}
	.check {
		margin: 10px 0 2px;
		font-family: var(--font-mono);
		font-size: 28px;
		font-weight: 600;
		letter-spacing: 0.08em;
		font-variant-numeric: tabular-nums;
	}
	.gap {
		display: inline-block;
		width: 0.5em;
	}
	.left {
		color: var(--dim2);
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
</style>

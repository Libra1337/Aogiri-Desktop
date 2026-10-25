<script lang="ts">
	// An image or a video the agent presented (`present_files`), shown in the
	// conversation above its card. The desktop reads the file itself (the
	// asset protocol); the phone page has the daemon read it (`load`,
	// `fs_image`: a data URL, up to 16 MiB), an image at once and a video only
	// when tapped, played from a blob that goes with the row. Nothing shows
	// when it cannot be read: the file's card still does.
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { onDestroy } from 'svelte';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { imageViewer } from '$lib/ui/imageViewer.svelte';
	import { t } from '$lib/i18n';

	let {
		path,
		video,
		load,
		group = [path]
	}: {
		path: string;
		video: boolean;
		load?: (path: string) => Promise<string>;
		/** The turn's presented images, for the full-size view's ← →. */
		group?: string[];
	} = $props();

	let loaded = $state('');
	let failed = $state(false);
	let fetching = $state(false);
	$effect(() => {
		if (!load || video) return;
		const p = path;
		loaded = '';
		failed = false;
		load(p).then(
			(src) => p === path && (loaded = src),
			() => p === path && (failed = true)
		);
	});
	// A fetched video plays from a blob, which goes with the component.
	$effect(() => {
		const url = loaded;
		return () => {
			if (url.startsWith('blob:')) URL.revokeObjectURL(url);
		};
	});
	const src = $derived(load ? loaded : convertFileSrc(path));

	let gone = false;
	onDestroy(() => (gone = true));
	/** A data URL's bytes as a blob (no fetch: the phone page's CSP lets
	 *  it connect only to its own origin and the relay). */
	function blobOf(dataUrl: string): Blob {
		const comma = dataUrl.indexOf(',');
		const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
		const bin = atob(dataUrl.slice(comma + 1));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new Blob([bytes], { type: mime });
	}
	async function fetchVideo() {
		if (!load) return;
		fetching = true;
		try {
			const blob = blobOf(await load(path));
			if (!gone) loaded = URL.createObjectURL(blob);
		} catch {
			failed = true;
		} finally {
			fetching = false;
		}
	}

	function open() {
		imageViewer.open(
			group.map((p) => ({ path: p, load })),
			Math.max(group.indexOf(path), 0)
		);
	}
</script>

{#if !failed}
	{#if video}
		{#if src}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video class="media" {src} controls preload="metadata" onerror={() => (failed = true)}></video>
		{:else}
			<button class="media ph" onclick={fetchVideo} disabled={fetching} aria-label={t('common.video.play')} title={t('common.video.play')}>
				{#if fetching}<CircleNotchIcon size={20} class="spin" />{:else}<PlayIcon size={20} weight="fill" />{/if}
			</button>
		{/if}
	{:else if src}
		<button class="shot" onclick={open} aria-label={t('common.image.open')} title={t('common.image.open')}>
			<img class="media" {src} alt="" onerror={() => (failed = true)} />
		</button>
	{:else}
		<span class="media ph"></span>
	{/if}
{/if}

<style>
	.media {
		display: block;
		max-width: 100%;
		max-height: 280px;
		border-radius: var(--r-md);
		border: 1px solid var(--hairline);
		background: var(--surface2);
	}
	img.media {
		object-fit: contain;
	}
	.shot {
		display: block;
		max-width: 100%;
		padding: 0;
		border: none;
		border-radius: var(--r-md);
		background: none;
		cursor: zoom-in;
	}
	.ph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 240px;
		height: 135px;
		color: var(--dim);
	}
	button.ph {
		cursor: pointer;
		transition: color var(--t-fast) var(--ease-base);
	}
	button.ph:hover:not(:disabled) {
		color: var(--text);
	}
</style>

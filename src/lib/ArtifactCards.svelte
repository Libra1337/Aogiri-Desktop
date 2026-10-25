<script lang="ts">
	// The deliverables a turn presented (`present_files`): images and videos
	// shown above, then one card per file — its icon by kind, its name and
	// what the agent said it is (else its size). A click opens the file in
	// the app; the folder button shows it in the file manager; a right-click
	// gives the conversation's file menu (`data-file`). Flat on the canvas
	// like the rest of a finished turn (design.md "Status, attention and
	// emphasis"): --surface, 1px --border, --r-lg.
	import FolderOpenIcon from 'phosphor-svelte/lib/FolderOpenIcon';
	import IconButton from '$lib/ui/IconButton.svelte';
	import ArtifactMedia from '$lib/ArtifactMedia.svelte';
	import { fileKind, fileName } from '$lib/attachments';
	import { FILE_ICONS } from '$lib/fileIcons';
	import { isMac } from '$lib/shortcuts';
	import type { Artifact } from '$lib/turnSummary';
	import { t } from '$lib/i18n';

	let {
		files,
		onOpen,
		onReveal,
		load,
		media = true
	}: {
		files: Artifact[];
		onOpen?: (path: string) => void;
		/** Absent where the file manager can't be reached (the phone page). */
		onReveal?: (path: string) => void;
		/** Reads a file on the engine's computer (the phone page). */
		load?: (path: string) => Promise<string>;
		/** Images and videos can be read here (the desktop, or through `load`). */
		media?: boolean;
	} = $props();

	const shown = $derived(media ? files.filter((f) => f.kind !== 'file') : []);
	const images = $derived(files.filter((f) => f.kind === 'image').map((f) => f.path));
	const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
	const revealLabel = isMac() ? 'chat.fileMenu.revealMac' : typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent) ? 'chat.fileMenu.revealWin' : 'chat.fileMenu.revealLinux';
</script>

<div class="deliver" aria-label={t('chat.artifacts.label')}>
	{#if shown.length}
		<div class="media">
			{#each shown as f (f.path)}
				<ArtifactMedia path={f.path} video={f.kind === 'video'} {load} group={images} />
			{/each}
		</div>
	{/if}
	<div class="cards" class:single={files.length === 1}>
		{#each files as f (f.path)}
			{@const Icon = FILE_ICONS[fileKind(f.path)]}
			<div class="card" data-file={f.path} title={f.path}>
				<button class="open" onclick={() => onOpen?.(f.path)} disabled={!onOpen}>
					<span class="icon"><Icon size={18} /></span>
					<span class="text">
						<span class="name">{fileName(f.path)}</span>
						<span class="desc">{f.description || size(f.size)}</span>
					</span>
				</button>
				{#if onReveal}
					<IconButton size="sm" title={t(revealLabel)} onclick={() => onReveal(f.path)}><FolderOpenIcon size={15} /></IconButton>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.deliver {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}
	.media {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.cards.single {
		grid-template-columns: minmax(0, 1fr);
		max-width: calc(50% - 4px);
	}
	.card {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 8px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		background: var(--surface);
		transition: border-color var(--t-fast) var(--ease-base);
	}
	.card:hover {
		border-color: var(--border-strong);
	}
	.open {
		display: flex;
		flex: 1;
		min-width: 0;
		align-items: center;
		gap: 12px;
		padding: 10px 4px 10px 10px;
		border: none;
		border-radius: var(--r-lg);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.open:disabled {
		cursor: default;
	}
	.icon {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--r-md);
		background: var(--surface2);
		color: var(--dim);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name,
	.desc {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: 500;
	}
	.desc {
		color: var(--dim);
		font-size: var(--fs-xs);
	}
	@media (max-width: 560px) {
		.cards,
		.cards.single {
			grid-template-columns: minmax(0, 1fr);
			max-width: none;
		}
	}
</style>

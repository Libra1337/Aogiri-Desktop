<script lang="ts">
	// A worktree subagent's changes beside its session's chat (an
	// `agentdiff:` tab, agentChanges.svelte.ts): the files changed in the
	// agent's worktree with their line counts, read-only; a click shows the
	// file's diff. Merging or dropping them is the agent's card's (merge_agent).
	import GitDiffIcon from 'phosphor-svelte/lib/GitDiffIcon';
	import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwiseIcon';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Modal from '$lib/ui/Modal.svelte';
	import { git } from '$lib/protocol';
	import { t } from '$lib/i18n';

	let { cwd = '', files = [], title = '' }: { cwd?: string; files?: string[]; title?: string } = $props();
	const dir = () => cwd || undefined;

	let stats = $state<Record<string, { add: number; del: number }>>({});
	let diff = $state<{ path: string; lines: { line: string; cls: string }[] } | null>(null);

	function classify(text: string) {
		return text.split('\n').map((line) => {
			let cls = 'ctx';
			if (line.startsWith('+') && !line.startsWith('+++')) cls = 'add';
			else if (line.startsWith('-') && !line.startsWith('---')) cls = 'del';
			else if (line.startsWith('@@')) cls = 'hunk';
			else if (line.startsWith('diff ') || line.startsWith('+++') || line.startsWith('---')) cls = 'meta';
			return { line, cls };
		});
	}
	const baseName = (p: string) => p.split('/').pop() || p;

	// The +/- line counts of the files (untracked new files show none).
	async function refresh() {
		if (!files.length) {
			stats = {};
			return;
		}
		try {
			const out = await git(['diff', '--numstat', '--', ...files], dir());
			const next: Record<string, { add: number; del: number }> = {};
			for (const l of out.split('\n').filter(Boolean)) {
				const [a, d, ...rest] = l.split('\t');
				next[rest.join('\t')] = { add: Number(a) || 0, del: Number(d) || 0 };
			}
			stats = next;
		} catch {
			/* best effort */
		}
	}
	$effect(() => {
		void files;
		refresh();
	});

	async function showDiff(path: string) {
		try {
			const text = await git(['diff', '--no-color', '--', path], dir());
			diff = { path, lines: classify(text || t('dock.changes.newFileDiff')) };
		} catch (e) {
			diff = { path, lines: classify(String(e)) };
		}
	}
</script>

<div class="changes">
	<div class="bar">
		<GitDiffIcon size={14} class="ccol" />
		<span class="title">{title} <span class="count">{files.length}</span></span>
		<IconButton size="sm" onclick={refresh} label={t('dock.files.refresh')} title={t('dock.files.refresh')}><ArrowsClockwiseIcon size={13} /></IconButton>
	</div>
	{#if files.length === 0}
		<p class="empty">{t('dock.changes.empty')}</p>
	{:else}
		<div class="list">
			{#each files as f (f)}
				{@const s = stats[f]}
				<div class="row">
					<button class="rpath" onclick={() => showDiff(f)} title={f}>
						<span class="rname">{baseName(f)}</span>
						<span class="rdir">{f}</span>
					</button>
					{#if s}<span class="stat"><span class="add">+{s.add}</span> <span class="del">−{s.del}</span></span>{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if diff}
	<Modal title={diff.path} width={760} padded={false} onClose={() => (diff = null)}>
		<pre class="diff">{#each diff.lines as d (d)}<span class={d.cls}>{d.line}
</span>{/each}</pre>
	</Modal>
{/if}

<style>
	.changes {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--hairline);
	}
	:global(.ccol) {
		color: var(--accent-bright);
	}
	.title {
		flex: 1;
		font-size: var(--fs-sm);
		font-weight: 600;
	}
	.count {
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		color: var(--dim2);
		background: var(--surface2);
		border-radius: var(--r-full);
		padding: 1px 7px;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 6px 8px 14px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 6px 5px 9px;
		border-radius: var(--r-sm);
	}
	.row:hover {
		background: var(--surface2);
	}
	.rpath {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		text-align: left;
		border: none;
		background: none;
		color: var(--text);
		cursor: pointer;
		padding: 2px 0;
	}
	.rname {
		font-family: var(--font-mono);
		font-size: var(--fs-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rpath:hover .rname {
		color: var(--accent-bright);
	}
	.rdir {
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		color: var(--dim2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stat {
		font-family: var(--font-mono);
		font-size: var(--fs-2xs);
		flex-shrink: 0;
	}
	.stat .add {
		color: var(--ok);
	}
	.stat .del {
		color: var(--err);
	}
	/* design.md "Controls and states": one line of --dim text. */
	.empty {
		margin: 0;
		padding: 14px;
		font-size: var(--fs-sm);
		color: var(--dim);
	}
	.diff {
		margin: 0;
		padding: 12px 14px;
		overflow: auto;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		line-height: 1.5;
		color: var(--text);
	}
	.diff .add {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 10%, transparent);
		display: block;
	}
	.diff .del {
		color: var(--err);
		background: color-mix(in oklab, var(--err) 10%, transparent);
		display: block;
	}
	.diff .hunk {
		color: var(--accent-bright);
		display: block;
	}
	.diff .meta {
		color: var(--dim);
		display: block;
	}
	.diff .ctx {
		display: block;
	}
</style>

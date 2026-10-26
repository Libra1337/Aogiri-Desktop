<script lang="ts">
	// Settings → 应用工具: the tools the daemon gives every agent it hosts
	// (LynShen, Claude Code through its in-process `lynshen` MCP server, Codex
	// as dynamic tools; ACP agents get none), switched in three groups:
	// presenting deliverables (`present_files`), proposing scheduled tasks
	// (`propose_schedule`) and the other conversations (`sessions.messages`:
	// off, ask, on). The daemon keeps them (`app_tools` / `app_tools_set`,
	// LynShen CLI 0.7.9+) and applies them to engines started afterwards. A
	// daemon before the op shows only the conversations' switch, kept in
	// config.json as before.
	import { onMount } from 'svelte';
	import { daemon, readConfig, writeConfig } from '$lib/protocol';
	import { t } from '$lib/i18n';
	import { toast } from '$lib/ui/toast.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Notice from '$lib/ui/Notice.svelte';
	import { readSessionMessages, SESSION_MESSAGE_MODES, sessionsPatch, type SessionMessagesMode } from '$lib/agents/teamConfig';
	import SettingsRow from './SettingsRow.svelte';
	import SettingsSection from './SettingsSection.svelte';

	type Group = 'present_files' | 'propose_schedule';
	const GROUPS: { key: Group; id: string; title: string; hint: string }[] = [
		{ key: 'present_files', id: 'app-tools-present', title: 'settings.appTools.presentFiles', hint: 'settings.appTools.presentFilesHint' },
		{ key: 'propose_schedule', id: 'app-tools-schedule', title: 'settings.appTools.proposeSchedule', hint: 'settings.appTools.proposeScheduleHint' }
	];

	/** null: not read yet; 'old': a daemon without the op. */
	let groups = $state<Record<Group, boolean> | 'old' | null>(null);
	let messages = $state<SessionMessagesMode | null>(null);
	let error = $state('');

	const messageOpts = $derived(SESSION_MESSAGE_MODES.map((v) => ({ value: v, label: t(`settings.team.messagesOpt.${v}`) })));
	const mode = (v: unknown): SessionMessagesMode | null => (SESSION_MESSAGE_MODES.includes(v as SessionMessagesMode) ? (v as SessionMessagesMode) : null);

	/** One op to the daemon, connecting first (the page may open before
	 *  the app has a connection). */
	async function ask(op: Record<string, unknown>) {
		await daemon.connect();
		return daemon.request(op);
	}

	function take(reply: Record<string, unknown>) {
		groups = { present_files: reply.present_files !== false, propose_schedule: reply.propose_schedule !== false };
		messages = mode(reply.sessions) ?? messages;
		error = '';
	}

	async function load() {
		try {
			take(await ask({ op: 'app_tools' }));
		} catch (e) {
			// An older daemon (unknown op): the conversations' switch alone,
			// from config.json; an unreachable one says why.
			const unknown = /unknown op|requires session/i.test(String(e instanceof Error ? e.message : e));
			groups = unknown ? 'old' : groups;
			if (!unknown) error = e instanceof Error ? e.message : String(e);
			const cfg = ((await readConfig().catch(() => null)) ?? {}) as Record<string, unknown>;
			messages ??= readSessionMessages(cfg);
		}
	}

	async function set(patch: Record<string, unknown>) {
		try {
			take(await ask({ op: 'app_tools_set', ...patch }));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			await load();
		}
	}

	/** The conversations' switch: through the daemon when it has the op,
	 *  else into config.json, its other keys of `sessions` kept. */
	async function setMessages(v: string) {
		const next = mode(v);
		if (!next) return;
		if (groups && groups !== 'old') return set({ sessions: next });
		try {
			const cfg = ((await readConfig()) ?? {}) as Record<string, unknown>;
			await writeConfig({ sessions: sessionsPatch(cfg.sessions, next) });
			messages = next;
		} catch (e) {
			toast.error(t('settings.page.saveFailed', { msg: String(e) }));
		}
	}

	onMount(load);
</script>

<SettingsSection title={t('settings.appTools.title')} description={t('settings.appTools.hint')}>
	{#if groups && groups !== 'old'}
		{#each GROUPS as row (row.key)}
			<SettingsRow id={row.id} title={t(row.title)} description={t(row.hint)}>
				<Switch checked={groups[row.key]} label={t(row.title)} onChange={(on) => set({ [row.key]: on })} />
			</SettingsRow>
		{/each}
	{/if}
	{#if messages}
		<SettingsRow id="team-messages" title={t('settings.team.messages')} description={t(`settings.team.messagesHint.${messages}`)}>
			<Segmented value={messages} options={messageOpts} onChange={setMessages} />
		</SettingsRow>
	{/if}
	{#if groups === 'old'}
		<Notice tone="info">{t('settings.appTools.oldDaemon')}</Notice>
	{/if}
	{#if error}
		<Notice>{t('settings.appTools.loadFailed', { msg: error })}</Notice>
	{/if}
</SettingsSection>

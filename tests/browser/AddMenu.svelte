<script lang="ts">
	// The title bar's + menu as the page builds it (src/routes/+page.svelte
	// ALL_PANELS), for screenshots: ?addmenu shows the panels of this build,
	// ?addmenu=before the ones before the Changes, Turns and Diagnostics
	// panels were removed (D42).
	import TitleBar from '../../src/lib/shell/TitleBar.svelte';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import TargetIcon from 'phosphor-svelte/lib/TargetIcon';
	import TreeStructureIcon from 'phosphor-svelte/lib/TreeStructureIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import GitDiffIcon from 'phosphor-svelte/lib/GitDiffIcon';
	import ClockCounterClockwiseIcon from 'phosphor-svelte/lib/ClockCounterClockwiseIcon';
	import FilesIcon from 'phosphor-svelte/lib/FilesIcon';
	import GitBranchIcon from 'phosphor-svelte/lib/GitBranchIcon';
	import TerminalWindowIcon from 'phosphor-svelte/lib/TerminalWindowIcon';
	import GlobeIcon from 'phosphor-svelte/lib/GlobeIcon';
	import PulseIcon from 'phosphor-svelte/lib/PulseIcon';
	import { setLocale, t } from '../../src/lib/i18n';
	import { readFileSync } from './addMenuSource';
	setLocale('zh');
	const before = new URL(location.href).searchParams.get('addmenu') === 'before';
	const ICONS: Record<string, typeof PlusIcon> = { plan: ListChecksIcon, goal: TargetIcon, agents: TreeStructureIcon, team: UsersThreeIcon, changes: GitDiffIcon, turns: ClockCounterClockwiseIcon, files: FilesIcon, git: GitBranchIcon, term: TerminalWindowIcon, browser: GlobeIcon, diag: PulseIcon };
	const GROUP: Record<string, string> = { plan: 'session', goal: 'session', agents: 'session', team: 'session', turns: 'session', changes: 'code', files: 'code', git: 'code', term: 'tools', browser: 'tools', diag: 'tools' };
	const OLD: Record<string, string> = { changes: '改动', turns: '回合', diag: '诊断' };
	const panels = before ? ['plan', 'goal', 'agents', 'team', 'changes', 'turns', 'files', 'git', 'term', 'browser', 'diag'] : readFileSync();
	const options = [
		{ key: 'chat', label: t('shell.agentSession'), icon: PlusIcon },
		...['session', 'code', 'tools'].flatMap((g) => panels.filter((k) => GROUP[k] === g).map((k) => ({ key: k, label: OLD[k] ?? t(`dock.tabs.${k}`), icon: ICONS[k], group: t(`shell.panelGroup.${g}`) })))
	];
</script>

<div style="height:520px;width:760px;background:var(--rail)">
	<TitleBar leftWidth={272} sidebarOpen onToggleSidebar={() => {}} heading title="对话宽度跟随窗口" subtitle="lynshen-desktop" addOptions={options} onAdd={() => {}} />
</div>

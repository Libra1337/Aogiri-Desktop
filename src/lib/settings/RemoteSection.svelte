<script lang="ts">
	// Settings → 远程访问: reaching this computer's lynshen daemon from a
	// phone or the web, through the LynShen account (relay v2) or a pairing
	// code, and the devices let in. Persists the LAN address to the backend
	// settings in localStorage.
	import { loadBackendSettings, saveBackendSettings } from '$lib/backends/settings';
	import DevicePairing from './DevicePairing.svelte';
	import SettingsSection from './SettingsSection.svelte';

	let { onSignIn }: { onSignIn?: () => void } = $props();

	let settings = $state(loadBackendSettings());

	function persist() {
		saveBackendSettings({ ...loadBackendSettings(), remoteAddress: settings.remoteAddress.trim() });
	}
</script>

<SettingsSection id="remote">
	<DevicePairing bind:address={settings.remoteAddress} onAddressChange={persist} {onSignIn} />
</SettingsSection>

import { describe, expect, it } from 'vitest';
import conf from '../../src-tauri/tauri.conf.json';

// The desktop CSP applies only to the packaged app: dev mode and CI never
// see it, so a change here breaks silently. Pin what the frontend needs.
describe('packaged-app CSP', () => {
	const sec = conf.app.security as { csp: Record<string, string>; dangerousDisableAssetCspModification?: string[] };

	it('keeps runtime <style> tags allowed', () => {
		// CodeMirror and Svelte transitions insert <style> without a nonce; a
		// nonce Tauri adds to style-src turns 'unsafe-inline' off.
		expect(sec.csp['style-src']).toContain("'unsafe-inline'");
		expect(sec.dangerousDisableAssetCspModification).toContain('style-src');
	});

	it('plays the videos an agent presents', () => {
		// A presented video plays from the asset protocol, which default-src
		// 'self' would block.
		expect(sec.csp['media-src']).toContain('asset:');
		expect(sec.csp['media-src']).toContain('http://asset.localhost');
	});

	it('allows inlined fonts', () => {
		// Vite inlines small font files as data: URLs (a KaTeX font is one).
		expect(sec.csp['font-src']).toContain('data:');
	});
});

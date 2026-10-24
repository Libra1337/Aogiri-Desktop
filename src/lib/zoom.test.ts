import { afterEach, describe, expect, it } from 'vitest';
import { prefs, ZOOM_STEPS } from './prefs.svelte';

describe('interface zoom', () => {
	afterEach(() => void prefs.stepZoom(0));

	it('steps through the levels, stops at either end and resets', () => {
		expect(prefs.zoom).toBe(1);
		expect(prefs.stepZoom(1)).toBe(true);
		expect(prefs.zoom).toBe(1.1);
		for (let i = 0; i < 20; i++) prefs.stepZoom(1);
		expect(prefs.zoom).toBe(ZOOM_STEPS.at(-1));
		expect(prefs.stepZoom(1)).toBe(false);
		for (let i = 0; i < 20; i++) prefs.stepZoom(-1);
		expect(prefs.zoom).toBe(ZOOM_STEPS[0]);
		expect(prefs.stepZoom(0)).toBe(true);
		expect(prefs.zoom).toBe(1);
		expect(prefs.stepZoom(0)).toBe(false);
	});
});

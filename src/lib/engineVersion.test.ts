import { describe, expect, it } from 'vitest';
import { engine, engineAtLeast, engineHas } from './engineVersion.svelte';

describe('engineAtLeast', () => {
	it('compares the daemon version numerically', () => {
		engine.version = '';
		expect(engineAtLeast('0.4.27')).toBe(false);
		engine.version = '0.4.25';
		expect(engineAtLeast('0.4.27')).toBe(false);
		engine.version = '0.4.27';
		expect(engineAtLeast('0.4.27')).toBe(true);
		engine.version = '0.4.100';
		expect(engineAtLeast('0.4.27')).toBe(true);
		engine.version = '0.5.0';
		expect(engineAtLeast('0.4.27')).toBe(true);
	});
});

describe('engineHas', () => {
	it('reads the features the daemon said hello with', () => {
		engine.features = [];
		expect(engineHas('queue')).toBe(false);
		expect(engineHas('files')).toBe(false);
		engine.features = ['queue', 'files'];
		expect(engineHas('queue')).toBe(true);
		expect(engineHas('files')).toBe(true);
		engine.features = [];
	});
});

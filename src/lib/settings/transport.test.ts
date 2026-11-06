import { describe, expect, it } from 'vitest';
import { catalog } from '$lib/i18n/messages';
import { parseTransportEvent, TRANSPORT_MODES, transportMode } from './transport';

describe('the transport setting (连接方式)', () => {
	it('reads config.json as the engine does: auto unless it says otherwise', () => {
		expect(transportMode(undefined)).toBe('auto');
		expect(transportMode('')).toBe('auto');
		expect(transportMode('auto')).toBe('auto');
		expect(transportMode('grpc')).toBe('auto');
		expect(transportMode(3)).toBe('auto');
		expect(transportMode('http')).toBe('http');
		expect(transportMode(' HTTPS ')).toBe('http');
		expect(transportMode('websocket')).toBe('websocket');
		expect(transportMode('ws')).toBe('websocket');
	});

	it('offers auto first, the default', () => {
		expect(TRANSPORT_MODES[0]).toBe('auto');
		expect([...TRANSPORT_MODES]).toEqual(['auto', 'http', 'websocket']);
	});

	it('has every label and the help text in each language', () => {
		for (const locale of ['zh', 'en'] as const) {
			const network = catalog[locale].settings.network;
			expect(network.transport.trim()).not.toBe('');
			expect(network.transportHint.trim()).not.toBe('');
			for (const mode of TRANSPORT_MODES) expect(network.transportMode[mode].trim()).not.toBe('');
		}
		expect(catalog.zh.settings.network.transport).toBe('连接方式');
		expect(catalog.zh.settings.network.transportMode.auto).toBe('自动（推荐）');
		expect(catalog.zh.settings.network.transportHint).toBe('只影响 OpenAI Responses / Codex 类模型。自动：优先 WebSocket，连不上时自动改用 HTTPS。');
	});
});

describe('the engine transport event', () => {
	it('reads how a request travelled and why it fell back', () => {
		expect(parseTransportEvent({ type: 'transport', transport: 'websocket', reused: true, incremental: true, fallback: null })).toEqual({
			transport: 'websocket',
			reused: true,
			incremental: true,
			fallback: null
		});
		expect(parseTransportEvent({ type: 'transport', transport: 'https', fallback: 'WebSocket upgrade refused: HTTP 404' })).toEqual({
			transport: 'https',
			reused: false,
			incremental: false,
			fallback: 'WebSocket upgrade refused: HTTP 404'
		});
	});

	it('ignores other events and unknown transports', () => {
		expect(parseTransportEvent({ type: 'thinking_start' })).toBeNull();
		expect(parseTransportEvent({ type: 'transport', transport: 'quic' })).toBeNull();
	});
});

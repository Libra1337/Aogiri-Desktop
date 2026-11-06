import { describe, expect, it } from 'vitest';
import { turnParts, TPS_MIN_MS } from './turnStats';
import { setLocale } from './i18n';
import type { TurnStats } from './chat.svelte';

describe('turn stats', () => {
	it('gives output speed as output tokens over streaming time, and nothing without either', () => {
		setLocale('zh');
		const turn = { elapsed: 9000, genMs: 4000, outTokens: 210 } as TurnStats;
		expect(turnParts(turn, ['tps'])).toEqual([{ text: '52.5 tok/s', title: expect.stringContaining('输出速度'), mono: true }]);
		expect(turnParts({ ...turn, genMs: undefined }, ['tps'])).toEqual([]);
		expect(turnParts({ ...turn, outTokens: 0 }, ['tps'])).toEqual([]);
	});

	it('gives no speed for a reply that arrived in one burst', () => {
		const turn = { elapsed: 9000, genMs: TPS_MIN_MS - 1, outTokens: 800 } as TurnStats;
		expect(turnParts(turn, ['tps'])).toEqual([]);
		expect(turnParts({ ...turn, genMs: TPS_MIN_MS }, ['tps'])).toHaveLength(1);
	});

	it('names the connection a turn used under its duration, and why HTTPS', () => {
		setLocale('zh');
		const turn = { elapsed: 9000, model: 'gpt-6.1-sol' } as TurnStats;
		expect(turnParts(turn, ['elapsed'])[0].title).toBe('本轮总耗时 · gpt-6.1-sol');
		const ws = { ...turn, transport: { transport: 'websocket', reused: true, incremental: true, fallback: null } } as TurnStats;
		expect(turnParts(ws, ['elapsed'])[0].title).toBe('本轮总耗时 · gpt-6.1-sol\n连接方式：WebSocket（复用连接）');
		const fell = { ...turn, transport: { transport: 'https', reused: false, incremental: false, fallback: 'WebSocket upgrade refused: HTTP 404' } } as TurnStats;
		expect(turnParts(fell, ['elapsed'])[0].title).toContain('连接方式：HTTPS（WebSocket 未用：WebSocket upgrade refused: HTTP 404）');
		setLocale('en');
		expect(turnParts(ws, ['elapsed'])[0].title).toContain('Connection: WebSocket (kept connection)');
		setLocale('zh');
	});
});

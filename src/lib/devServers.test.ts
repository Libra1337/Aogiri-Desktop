import { beforeEach, describe, expect, it, vi } from 'vitest';

const { opened, prefs } = vi.hoisted(() => ({ opened: [] as string[], prefs: { devServerAutoOpen: false } }));
vi.mock('$lib/browser.svelte', () => ({ browser: { open: (url: string) => opened.push(url) } }));
vi.mock('$lib/prefs.svelte', () => ({ prefs }));

import { DevServers, parseDevServers, shortUrl } from './devServers.svelte';
import { notices } from './ui/notices.svelte';
import { setLocale } from './i18n';
setLocale('zh');

const server = (port: number, extra: Record<string, unknown> = {}) => ({ port, url: `http://localhost:${port}/`, pid: 4000 + port, name: 'node', session: 's1', ...extra });
const frame = (...servers: unknown[]) => ({ type: 'dev_servers', servers });

describe('dev servers', () => {
	beforeEach(() => {
		opened.length = 0;
		prefs.devServerAutoOpen = false;
		for (const n of notices.items) notices.dismiss(n.id);
	});

	it('reads the frame, and only a frame with a list', () => {
		expect(parseDevServers({ type: 'sessions' })).toBeNull();
		expect(parseDevServers(frame(server(5173), { port: 'x', url: 'http://a' }, { port: 1, url: 'ftp://a' }))).toEqual([server(5173)]);
		expect(parseDevServers(frame({ port: 8000, url: 'http://[::1]:8000/' }))).toEqual([{ port: 8000, url: 'http://[::1]:8000/', pid: 0, name: '', session: null }]);
		expect(shortUrl('http://localhost:5173/')).toBe('localhost:5173');
	});

	it('announces a server that comes up, not those already up when it connects', () => {
		const d = new DevServers();
		d.titleOf = (s) => (s === 's1' ? '会话缓存分片' : '');
		d.handle(frame(server(3000)));
		expect(notices.items).toEqual([]);
		d.handle(frame(server(3000), server(5173)));
		expect(notices.items.map((n) => [n.title, n.detail])).toEqual([['开发服务器已启动', 'localhost:5173 · 会话缓存分片']]);
		notices.items[0]!.action!.run();
		expect(opened).toEqual(['http://localhost:5173/']);
		// Its notice goes with it when it stops.
		d.handle(frame(server(3000)));
		expect(notices.items).toEqual([]);
		// A reconnect lists them again: nothing new.
		d.disconnected();
		d.handle(frame(server(3000)));
		d.handle(frame(server(3000), server(5173)));
		expect(notices.items).toEqual([]);
	});

	it('opens it in the built-in browser at once when the setting says so', () => {
		prefs.devServerAutoOpen = true;
		const d = new DevServers();
		d.handle(frame());
		d.handle(frame(server(8080, { session: null })));
		expect(opened).toEqual(['http://localhost:8080/']);
		expect(notices.items.map((n) => [n.title, n.detail, !!n.action])).toEqual([['开发服务器已启动，已在内置浏览器打开', 'localhost:8080', false]]);
	});
});

describe('corner notices', () => {
	it('keeps three, replaces one with the same key, and holds while pointed at', () => {
		vi.useFakeTimers();
		for (const n of notices.items) notices.dismiss(n.id);
		for (const k of ['a', 'b', 'c', 'd']) notices.show(k);
		expect(notices.items.map((n) => n.title)).toEqual(['b', 'c', 'd']);
		notices.show('d2', { key: 'k' });
		notices.show('d3', { key: 'k' });
		expect(notices.items.map((n) => n.title)).toEqual(['c', 'd', 'd3']);
		const held = notices.items.at(-1)!.id;
		notices.hold(held);
		vi.advanceTimersByTime(60_000);
		expect(notices.items.map((n) => n.id)).toEqual([held]);
		notices.resume(held);
		vi.advanceTimersByTime(11_000);
		expect(notices.items).toEqual([]);
		vi.useRealTimers();
	});
});

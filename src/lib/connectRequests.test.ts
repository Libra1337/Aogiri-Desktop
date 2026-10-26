import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./protocol', () => ({ daemon: {} }));

import { ConnectRequests, clientKind, secondsLeft } from './connectRequests.svelte';
import type { DaemonClient } from './daemon';

const request = vi.fn();
const store = () => new ConnectRequests({ request } as unknown as DaemonClient);
// As the daemon sends it (LynShen-CLI relay.rs Request::to_json).
const phone = { type: 'connect_request', request: 'cr-1', name: 'iPhone', client: 'aogiri-phone', check: '482913', at: 1000 };

beforeEach(() => request.mockReset());

describe('ConnectRequests', () => {
	it('shows a request until the daemon closes it, telling of it once', () => {
		const requests = store();
		const told = vi.fn();
		requests.onRequest = told;
		requests.handle(phone);
		requests.handle(phone);
		expect(requests.open).toEqual([{ id: 'cr-1', name: 'iPhone', client: 'aogiri-phone', check: '482913', at: 1000 }]);
		expect(told).toHaveBeenCalledOnce();
		requests.handle({ type: 'connect_request_closed', request: 'cr-1', outcome: 'expired' });
		expect(requests.open).toEqual([]);
	});

	it('sends the decision and drops the request at once', async () => {
		const requests = store();
		requests.handle(phone);
		request.mockResolvedValueOnce({ type: 'connect_decided' });
		await requests.decide('cr-1', true);
		expect(request).toHaveBeenCalledWith({ op: 'connect_decide', request: 'cr-1', allow: true });
		expect(requests.open).toEqual([]);
	});

	it('takes the open requests when it connects', async () => {
		const requests = store();
		request.mockResolvedValueOnce({ type: 'connect_requests', requests: [{ request: 'cr-2', name: 'Chrome', client: 'lynshen-web', check: '000123', at: 2 }, { name: 'no id' }] });
		await requests.sync();
		expect(request).toHaveBeenCalledWith({ op: 'connect_requests' });
		expect(requests.open.map((r) => [r.id, r.check])).toEqual([['cr-2', '000123']]);
	});

	it('keeps what it shows when the daemon does not know the op', async () => {
		const requests = store();
		requests.handle(phone);
		request.mockRejectedValueOnce(new Error('unknown op'));
		await requests.sync();
		request.mockResolvedValueOnce({ type: 'connect_requests' });
		await requests.sync();
		expect(requests.open.map((r) => r.id)).toEqual(['cr-1']);
	});

	it('drops a malformed check code and forgets requests when the daemon goes', () => {
		const requests = store();
		requests.handle({ ...phone, check: '12' });
		expect(requests.open[0].check).toBe('');
		requests.disconnected();
		expect(requests.open).toEqual([]);
	});

	it('names the kinds of client and counts down the 120 s', () => {
		expect(clientKind('aogiri-phone')).toBe('settings.remote.clientPhone');
		expect(clientKind('lynshen-web')).toBe('settings.remote.clientWeb');
		expect(clientKind('lynshen-cli')).toBe('settings.remote.clientCli');
		expect(clientKind(undefined)).toBe('');
		expect(secondsLeft({ at: 0 }, 0)).toBe(120);
		expect(secondsLeft({ at: 0 }, 119_001)).toBe(1);
		expect(secondsLeft({ at: 0 }, 200_000)).toBe(0);
	});
});

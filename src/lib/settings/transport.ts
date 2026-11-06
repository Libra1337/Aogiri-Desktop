// Settings → 网络 → 连接方式: how the LynShen engine's OpenAI Responses /
// Codex requests travel (config.json `transport`, LynShen CLI
// llm-provider-kit websocket.rs). `auto` (the default) uses the Responses
// WebSocket mode where the endpoint serves it and HTTPS where it does not;
// `http` keeps HTTPS; `websocket` uses WebSocket only and shows its errors.
// Anthropic Messages and Chat Completions models always use HTTPS.

export const TRANSPORT_MODES = ['auto', 'http', 'websocket'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** The setting as config.json holds it, as the engine reads it: absent,
 *  empty or unknown is `auto`; the engine's aliases count. */
export function transportMode(value: unknown): TransportMode {
	const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
	if (v === 'http' || v === 'https' || v === 'sse') return 'http';
	if (v === 'websocket' || v === 'ws' || v === 'wss') return 'websocket';
	return 'auto';
}

/** How the engine's last model request travelled (its `transport` event). */
export interface TransportInfo {
	transport: 'websocket' | 'https';
	/** A connection kept from an earlier request carried it. */
	reused: boolean;
	/** Only the new input went, after the previous response. */
	incremental: boolean;
	/** Why HTTPS carried a request `auto` would have sent over WebSocket. */
	fallback: string | null;
}

/** The engine's `transport` event, or null when it is not one. */
export function parseTransportEvent(ev: Record<string, unknown>): TransportInfo | null {
	if (ev.type !== 'transport') return null;
	const transport = ev.transport === 'websocket' ? 'websocket' : ev.transport === 'https' ? 'https' : null;
	if (!transport) return null;
	const fallback = typeof ev.fallback === 'string' && ev.fallback.trim() ? ev.fallback.trim() : null;
	return { transport, reused: ev.reused === true, incremental: ev.incremental === true, fallback };
}

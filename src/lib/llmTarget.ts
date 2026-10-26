// The endpoint one-shot AI text goes to (commit messages, PR text, a fork's
// 带回结论): the session's provider, else the LynShen gateway, else the
// first configured provider; an alias suffix (`[1m]`) leaves the model id.
export interface LlmTarget {
	provider: string;
	baseUrl: string;
	format: string;
	model: string;
}

interface Provider {
	id: string;
	base_url: string;
	format: string;
	models: { name: string }[];
}

export function llmTarget(providers: readonly Provider[], chat?: { provider?: string | null; model?: string } | null): LlmTarget | null {
	const pick = providers.find((p) => p.id === chat?.provider) ?? providers.find((p) => p.id === 'lynshen') ?? providers[0];
	if (!pick) return null;
	const model = chat?.provider === pick.id && chat?.model ? chat.model.replace(/\[.*?\]$/, '') : (pick.models[0]?.name ?? '');
	if (!model) return null;
	return { provider: pick.id, baseUrl: pick.base_url, format: pick.format, model };
}

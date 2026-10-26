// How an ACP agent's own settings (`session_options`) read in the model
// menu: its mode option and the modes the app already names (计划, 默认) in
// the app's words; anything else as the agent names it.

import { t } from '$lib/i18n';
import type { SessionOption } from '$lib/protocol';

export function optionLabel(o: Pick<SessionOption, 'category' | 'name'>): string {
	return o.category === 'mode' ? t('chat.modeSection') : o.name;
}

export function choiceLabel(o: Pick<SessionOption, 'category'>, choice: { value: string; name: string }): string {
	if (o.category === 'mode') {
		if (choice.value === 'plan') return t('chat.approvalPlan');
		if (choice.value === 'default') return t('chat.effortDefault');
	}
	return choice.name;
}

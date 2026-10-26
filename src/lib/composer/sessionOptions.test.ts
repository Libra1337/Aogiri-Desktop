import { describe, expect, it } from 'vitest';
import { setLocale } from '$lib/i18n';
import { choiceLabel, optionLabel } from './sessionOptions';

describe("an ACP agent's settings", () => {
	it('names the mode option and the modes the app knows in its words', () => {
		setLocale('zh');
		const mode = { category: 'mode', name: 'Mode' };
		expect(optionLabel(mode)).toBe('模式');
		expect(choiceLabel(mode, { value: 'plan', name: 'Plan' })).toBe('计划');
		expect(choiceLabel(mode, { value: 'default', name: 'Default' })).toBe('默认');
		expect(choiceLabel(mode, { value: 'yolo', name: 'Yolo' })).toBe('Yolo');
		// Other settings as the agent names them.
		const think = { category: 'other', name: 'Show thinking' };
		expect(optionLabel(think)).toBe('Show thinking');
		expect(choiceLabel(think, { value: 'plan', name: 'Plan' })).toBe('Plan');
	});
});

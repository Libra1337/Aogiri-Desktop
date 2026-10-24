import { describe, it, expect } from 'vitest';
import { themeVariables } from './mermaid';

describe('mermaid theme', () => {
	const tokens: Record<string, string> = {
		'--bg': '#1a1a1a',
		'--panel': '#262626',
		'--surface': '#1f1f1f',
		'--surface2': '#242424',
		'--text': '#ececec',
		'--dim': '#ababab',
		'--dim2': '#888888',
		'--border-strong': '#3a3a3a'
	};
	const vars = themeVariables((name) => tokens[name], 'system-ui', '13px', true);

	it('draws nodes, text and lines in the theme tokens', () => {
		expect(vars).toMatchObject({
			darkMode: true,
			background: '#1a1a1a',
			primaryColor: '#262626',
			primaryBorderColor: '#888888',
			primaryTextColor: '#ececec',
			textColor: '#ececec',
			lineColor: '#ababab',
			fontFamily: 'system-ui',
			fontSize: '13px'
		});
	});

	it('is flat: no gradient edges or shadows', () => {
		expect(vars.useGradient).toBe(false);
		expect(vars.dropShadow).toBe('none');
	});
});

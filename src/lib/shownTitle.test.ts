import { describe, expect, it } from 'vitest';
import { shownTitle, UNTITLED } from './chat.svelte';

describe('shownTitle (ticket #71)', () => {
	it('shows the message a helper conversation was started with, not its wrapper', () => {
		expect(shownTitle('<session_message from="s6ae7455" title="主会话" hop="1">\n生成本地安装包\n</session_message>')).toBe('生成本地安装包');
		expect(shownTitle('<session_message from="s6ae7455" title="主会话" hop="1">生成本地安装包')).toBe('生成本地安装包');
	});
	it('a wrapper cut before its message reads as a new chat', () => {
		expect(shownTitle('<session_message from="s6ae7455')).not.toContain('session_message');
	});
	it('leaves other titles alone', () => {
		expect(shownTitle('修复登录')).toBe('修复登录');
		expect(shownTitle('<b> tags in a title')).toBe('<b> tags in a title');
		expect(shownTitle(UNTITLED)).not.toBe(UNTITLED);
	});
});

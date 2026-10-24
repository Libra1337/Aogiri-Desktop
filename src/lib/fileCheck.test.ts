import { describe, expect, it } from 'vitest';
import { fileCheck, RETRY_MS } from './fileCheck';

describe('fileCheck', () => {
	it('asks once per path, keeps a found file and asks again for a missing one later', async () => {
		let at = 0;
		const asked: string[] = [];
		const exists = new Set(['src/a.ts']);
		const check = fileCheck(async (href) => {
			asked.push(href);
			return exists.has(href);
		}, () => at);
		expect(check.known('src/a.ts')).toBeUndefined();
		const [a, b] = await Promise.all([check.check('src/a.ts'), check.check('src/a.ts')]);
		expect([a, b]).toEqual([true, true]);
		expect(asked).toEqual(['src/a.ts']);
		expect(await check.check('src/b.ts')).toBe(false);
		expect(check.known('src/b.ts')).toBe(false);
		at = RETRY_MS + 1;
		// The agent wrote it meanwhile: asked again, found.
		expect(check.known('src/b.ts')).toBeUndefined();
		expect(check.known('src/a.ts')).toBe(true);
		exists.add('src/b.ts');
		expect(await check.check('src/b.ts')).toBe(true);
	});

	it('reads a failed lookup as missing', async () => {
		const check = fileCheck(() => Promise.reject(new Error('no app')));
		expect(await check.check('x.ts')).toBe(false);
	});
});

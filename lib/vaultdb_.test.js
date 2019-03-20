exports = module.exports = (createDb) => {
	describe('Integration', () => {
		it('should read and write data', async () => {
			const db = createDb();

			await db.del(true);
			expect(await db.get('$keys')).toEqual([]);

			const time = Date.now();

			await db.set('a.b', { c: 3 });
			expect(await db.get('a.b.c')).toEqual(3);
			expect(await db.get('a.b$keys')).toEqual(['c']);

			await db.set('a.b.d', 4);
			expect(await db.get('a.b.d')).toEqual(4);
			expect(await db.get('a.b')).toEqual(expect.any(Object));
			expect((await db.get('a')).b.c).toEqual(3);

			await db.set('a.c', 5);
			expect((await db.get('a')).b.c).toEqual(3);

			await db.del('a.c');
			expect(await db.get('a.c')).toBeUndefined();

			await db.set('a.b.c', {});
			expect(await db.get('a.b.c')).toBeUndefined();
			expect(await db.get('a.b.d')).toEqual(4);
			expect((await db.get('a.b')).d).toEqual(4);

			await db.del('a.b.d');
			expect(await db.get('$keys')).toEqual([]);

			await db.set('a', 11);
			expect(await db.get('a')).toEqual(11);

			await db.set('b.c', 12);
			expect(await db.get('b.c')).toEqual(12);
			expect(await db.get('$keys')).toEqual(['a', 'b']);

			db.stop();
			console.log(`complete ${Date.now() - time}ms\n`);
		});

		it('should perform backup', async () => {
			// await db.backup(bakuri);
			// expect('backup', 1);
			// await db.del('b.c');
			// await db.get('$keys');
			// expect(`del'd root`, res.indexOf('b') < 0);
			// await db.restore(bakuri);
			// await db.get('$keys');
			// expect('restore', res.length == 2 && res.every(r => ['a', 'b'].indexOf(r) >= 0));
		});

		it('should clean issues', async () => {
			// await db.set('e', 5, -1);
			// await db.get('e');
			// expect(`set for clean`, res == 5);
			// await db.clean();
			// await db.get('e');
			// expect(`clean'd`, !res);
			// await db.$insert({ k: 'dup', d: 5, t: 5 });
			// await db.$insert({ k: 'dup', d: 15, t: 15 });
			// await db.$finddups();
			// await db.clean();
			// await db.get('dup');
			// expect(`clean dups`, res == 15);
			// await db.del(true);
		});
	});
};

it('should be a test suit', () => {
	expect(module.exports).toEqual(expect.any(Function));
});

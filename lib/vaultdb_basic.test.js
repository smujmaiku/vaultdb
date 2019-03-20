const VaultDbBasic = require('./vaultdb_basic');
const vaultDbTests = require('./vaultdb_.test');
const common = require('./common');

const now = 1451718e6;
global.Date.now = jest.fn(() => now);
global.Math.random = () => 0.42;

describe('VaultDbBasic integration tests', () => {
	// vaultDbTests(() => new VaultDbBasic());
});

describe('VaultDbBasic', function() {
	describe('constructor', () => {
		it('should ', () => {
			// expect('tests to be written').toBe(true);
		});
	});

	describe('$find', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: now, z: 'z1' });
			db._db.push({ k: 'a.b', d: 2, t: now, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: now, z: 'z3' });
			expect(await db.$find('a.b')).toEqual([
				{ k: 'a', d: 1, t: now, z: 'z1' },
				{ k: 'a.b', d: 2, t: now, z: 'z2' },
			]);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'a', d: 2, t: 2, z: 'z2' });
			db._db.push({ k: 'a', d: 3, t: 3, z: 'z3' });
			expect(await db.$find('a', 2)).toEqual([
				{ k: 'a', d: 1, t: 1, z: 'z1' },
			]);
		});

		it('should resolve all data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: now, z: 'z1' });
			db._db.push({ k: 'a.b', d: 2, t: now, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: now, z: 'z3' });
			expect(await db.$find(true)).toEqual([
				{ k: 'a', d: 1, t: now, z: 'z1' },
				{ k: 'a.b', d: 2, t: now, z: 'z2' },
				{ k: 'c', d: 3, t: now, z: 'z3' },
			]);
		});
	});

	describe('$findids', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: now, z: 'z1' });
			db._db.push({ k: 'a.b', d: 2, t: now, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: now, z: 'z3' });
			expect(await db.$findids(['z1', 'z2'])).toEqual([
				{ k: 'a', d: 1, t: now, z: 'z1' },
				{ k: 'a.b', d: 2, t: now, z: 'z2' },
			]);
		});

		it('should accept a uid string', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: now, z: 'z1' });
			db._db.push({ k: 'a.b', d: 2, t: now, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: now, z: 'z3' });
			expect(await db.$findids('z2')).toEqual([
				{ k: 'a.b', d: 2, t: now, z: 'z2' },
			]);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'a', d: 2, t: 2, z: 'z1' });
			db._db.push({ k: 'a', d: 3, t: 3, z: 'z1' });
			expect(await db.$findids(['z1'], 2)).toEqual([
				{ k: 'a', d: 1, t: 1, z: 'z1' },
			]);
		});
	});

	describe('$findexpires', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, e: 1, z: 'z1' });
			db._db.push({ k: 'b', d: 2, t: 2, e: 2, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: 3, e: 3, z: 'z3' });
			db._db.push({ k: 'i', d: 1, t: 9, z: 'z9' });
			expect(await db.$findexpires(2)).toEqual([
				{ k: 'a', d: 1, t: 1, e: 1, z: 'z1' },
			]);
		});

		it('should resolve all data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, e: 1, z: 'z1' });
			db._db.push({ k: 'b', d: 2, t: 2, e: 2, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: 3, e: 3, z: 'z3' });
			db._db.push({ k: 'i', d: 9, t: 9, z: 'z9' });
			expect(await db.$findexpires()).toEqual([
				{ k: 'a', d: 1, t: 1, e: 1, z: 'z1' },
				{ k: 'b', d: 2, t: 2, e: 2, z: 'z2' },
				{ k: 'c', d: 3, t: 3, e: 3, z: 'z3' },
			]);
		});
	});

	describe('$finddups', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, e: 1, z: 'z1' });
			db._db.push({ k: 'a', d: 2, t: 2, e: 2, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: 3, z: 'z3' });
			db._db.push({ k: 'h', d: 9, t: 9, z: 'z9' });
			db._db.push({ k: 'h', d: 8, t: 8, z: 'z8' });
			expect(await db.$finddups()).toEqual([
				{ k: 'h', d: 9, t: 9, z: 'z9' },
			]);
		});
	});

	describe('$listkeys', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'b.c', d: 2, t: 2, z: 'z2' });
			db._db.push({ k: 'a', d: 3, t: 3, z: 'z3' });
			expect(await db.$listkeys()).toEqual(['a', 'b.c']);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'b', d: 2, t: 2, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: 3, z: 'z2' });
			expect(await db.$listkeys(2)).toEqual(['a']);
		});
	});

	describe('$rootkeys', () => {
		it('should resolve data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'b.c', d: 2, t: 2, z: 'z2' });
			db._db.push({ k: 'a', d: 3, t: 3, z: 'z3' });
			expect(await db.$rootkeys()).toEqual(['a', 'b']);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', d: 1, t: 1, z: 'z1' });
			db._db.push({ k: 'b', d: 2, t: 2, z: 'z2' });
			db._db.push({ k: 'c', d: 3, t: 3, z: 'z2' });
			expect(await db.$rootkeys(2)).toEqual(['a']);
		});
	});

	describe('$insert', () => {
		it('should insert data', async () => {
			const data = { k: 'a', d: 1 };
			const db = new VaultDbBasic();
			db.stop();
			expect(await db.$insert(data)).toEqual(common.padData(data));
			expect(db._db).toEqual([common.padData(data)]);
		});
	});

	describe('$update', () => {
		it('should update data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', z: 'z1' });
			db._db.push({ k: 'b', z: 'z2' });
			expect(await db.$update({ d: 1, z: 'z1' })).toEqual({ k: 'a', d: 1, z: 'z1' });
			expect(db._db).toEqual([
				{ k: 'a', d: 1, z: 'z1' },
				{ k: 'b', z: 'z2' },
			]);
		});
	});

	describe('$removeuid', () => {
		it('should remove data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', z: 'z1' });
			db._db.push({ k: 'b', z: 'z2' });
			db._db.push({ k: 'c', z: 'z3' });
			expect(await db.$removeuid(['z1', 'z3', 'z4'])).toEqual(2);
			expect(db._db).toEqual([
				{ k: 'b', z: 'z2' },
			]);
		});

		it('should accept a string uid', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'b', z: 'z1' });
			db._db.push({ k: 'c', z: 'z2' });
			expect(await db.$removeuid('z1')).toEqual(1);
			expect(db._db).toEqual([
				{ k: 'c', z: 'z2' },
			]);
		});
	});

	describe('$removeall', () => {
		it('should remove data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', t: 1, z: 'z1' });
			db._db.push({ k: 'b', t: 2, z: 'z2' });
			db._db.push({ k: 'c', t: 3, z: 'z3' });
			expect(await db.$removeall(2)).toEqual(1);
			expect(db._db).toEqual([
				{ k: 'b', t: 2, z: 'z2' },
				{ k: 'c', t: 3, z: 'z3' },
			]);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', t: now - 1, z: 'z1' });
			db._db.push({ k: 'b', t: now, z: 'z2' });
			expect(await db.$removeall()).toEqual(1);
			expect(db._db).toEqual([
				{ k: 'b', t: now, z: 'z2' },
			]);
		});
	});

	describe('$remove', () => {
		it('should remove data', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', z: 'z1' });
			db._db.push({ k: 'a.b', z: 'z2' });
			db._db.push({ k: 'a.c', e: now - 1, z: 'z3' });
			db._db.push({ k: 'a.c', e: now + 1, z: 'z4' });
			db._db.push({ k: 'c', z: 'z5' });
			expect(await db.$remove('a')).toEqual(4);
			expect(db._db).toEqual([
				{ k: 'c', z: 'z5' },
			]);
		});

		it('should filter time', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', t: 1, z: 'z1' });
			db._db.push({ k: 'a', t: 2, z: 'z2' });
			db._db.push({ k: 'a', t: 3, z: 'z3' });
			expect(await db.$remove('a', 2)).toEqual(2);
			expect(db._db).toEqual([
				{ k: 'a', t: 3, z: 'z3' },
			]);
		});

		it('should filter expire', async () => {
			const db = new VaultDbBasic();
			db.stop();
			db._db.push({ k: 'a', z: 'z1' });
			db._db.push({ k: 'a', e: 1, z: 'z2' });
			db._db.push({ k: 'a', e: 2, z: 'z3' });
			db._db.push({ k: 'a', e: 3, z: 'z4' });
			expect(await db.$remove('a', 0, 2)).toEqual(2);
			expect(db._db).toEqual([
				{ k: 'a', z: 'z1' },
				{ k: 'a', e: 3, z: 'z4' },
			]);
		});
	});
});

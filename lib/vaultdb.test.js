const ObjDb = require('objdb');
const VaultDb = require('./vaultdb');
const common = require('./common');

const now = 1451718e6;
global.Date.now = jest.fn(() => now);

describe('VaultDb', function() {
	describe('constructor', () => {
		it('should construct', () => {
			const db = new VaultDb();
			expect(db).toBeDefined();
		});

		it('should setup cleaner', async () => {
			const expire = 2e12;
			const db = new VaultDb();
			expect(db.cleaner).toEqual(expect.any(ObjDb.Cleaner));

			db.$findexpires = jest.fn(() => [{ e: 1 }, { e: 2 }]);
			expect(await db.cleaner.find(expire)).toEqual([1, 2]);
			expect(db.$findexpires).toBeCalledWith(expire);

			db.clean = jest.fn();
			db.cleaner.del();
			expect(db.clean).toBeCalled();
		});
	});

	describe('get', () => {
		const db = new VaultDb();
		db.$find = jest.fn(() => ([
			{ k: 'a.b', d: 1 },
			{ k: 'a.c', d: 2 },
			{ k: 'a.z', d: 'deleteme' },
			{ k: 'a.z', d: undefined },
			{ k: 'd.e', d: { f: '5' } },
		]));
		db.$rootkeys = jest.fn(() => (['a', 'd']));

		it('should resolve related data', async () => {
			expect(await db.get('a.b')).toEqual(1);
			expect(await db.get('a')).toEqual({ b: 1, c: 2 });
			expect(await db.get('d.e.f')).toEqual('5');
			expect(await db.get('b')).toBeUndefined();
		});

		it('should resolve meta data', async () => {
			expect(await db.get('a$keys')).toEqual(['b', 'c']);
			expect(await db.get('d$type')).toEqual(common.getType({}));
			expect(await db.get('d.e.f$type')).toEqual(common.getType(''));
		});

		it('should resolve root keys', async () => {
			expect(await db.get('$keys')).toEqual(['a', 'd']);
		});
	});

	describe('add', () => {
		const name = 'a.b';
		const data = {};
		const expire = 1e12;

		it('should set data', async () => {
			const id = 'c';

			const db = new VaultDb();
			db.set = jest.fn();
			await db.add(name, data, expire, id);
			expect(db.set).toBeCalledWith(`${name}.${id}`, data, expire);
		});

		it('should resolve the id', async () => {
			const db = new VaultDb();
			db.set = jest.fn();
			const id = await db.add(name, data, expire);
			expect(db.set).toBeCalledWith(`${name}.${id}`, data, expire);
		});
	});

	describe('set', () => {
		it('should set data', async () => {
			const db = new VaultDb();
			db.$insert = jest.fn();
			db.del = jest.fn();
			db.cleaner.setTimer = jest.fn();
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.set('a.b', 1);
			expect(db.$insert).toBeCalledWith({
				d: 1,
				k: 'a.b',
				t: now,
			});
			expect(db.del).toBeCalledWith('a.b', now, undefined, 1);
			expect(db.emit).toBeCalledWith('$set');
			expect(db.send).toBeCalledWith('a.b');
			expect(db.cleaner.setTimer).not.toBeCalled();
		});

		it('should set expiring data', async () => {
			const expire = now + 1e5;

			const db = new VaultDb();
			db.$insert = jest.fn();
			db.del = jest.fn();
			db.cleaner.setTimer = jest.fn();
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.set('a.b', 1, 100);
			expect(db.$insert).toBeCalledWith({
				d: 1,
				k: 'a.b',
				t: now,
				e: expire,
			});
			expect(db.del).toBeCalledWith('a.b', now, expire, 1);
			expect(db.emit).toBeCalledWith('$set');
			expect(db.send).toBeCalledWith('a.b');
			expect(db.cleaner.setTimer).toBeCalledWith(expire);
		});

		it('should del if data is empty', async () => {
			const expire = now + 1e5;

			const db = new VaultDb();
			db.del = jest.fn();
			db.$insert = jest.fn();

			await db.set('a', undefined);
			expect(db.del).toBeCalledWith('a', now, undefined);

			await db.set('b', undefined, 100);
			expect(db.del).toBeCalledWith('b', now, expire);

			await db.set('c', {});
			expect(db.del).toBeCalledWith('c', now, undefined);

			expect(db.$insert).not.toBeCalled();
		});
	});

	describe('del', () => {
		it('should wipe data', async () => {
			const name = 'a.b';
			const time = 1e12;
			const expire = 2e12;

			const db = new VaultDb();
			db.$remove = jest.fn(() => 1);
			db.$find = jest.fn(() => []);
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.del(name, time, expire);

			expect(db.$remove).toBeCalledWith(name, time, expire);
			expect(db.$find).toBeCalledWith(name, time);
			expect(db.emit).toBeCalledWith('$del');
			expect(db.send).toBeCalledWith(name);
		});

		it('should wiping data not do anything', async () => {
			const name = 'a.b';

			const db = new VaultDb();
			db.$remove = jest.fn(() => 0);
			db.$find = jest.fn(() => [
				{},
				{ k: 'b', d: { c: 1 } },
			]);
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.del(name);

			expect(db.$remove).toBeCalledWith(name, now + 1, undefined);
			expect(db.$find).toBeCalledWith(name, now + 1);
			expect(db.emit).not.toBeCalled();
			expect(db.send).not.toBeCalled();
		});

		describe('deep values', () => {
			it('should update objects', async () => {
				const db = new VaultDb();
				db.$remove = jest.fn(() => 0);
				db.$update = jest.fn();
				db.$find = jest.fn(() => [
					{ k: 'a.b', d: { c: 1, d: 2 }, z: 'z1' },
					{ k: 'a.b', d: { c: 1, e: 3 }, e: 1, z: 'z2' },
				]);
				db.emit = jest.fn();
				db.send = jest.fn();

				await db.del('a.b.c');

				expect(db.$update).toBeCalledWith({ k: 'a.b', d: { d: 2 }, z: 'z1' });
				expect(db.$update).toBeCalledWith({ k: 'a.b', d: { e: 3 }, e: 1, z: 'z2' });
				expect(db.$update).toBeCalledTimes(2);
				expect(db.emit).toBeCalled();
				expect(db.send).toBeCalled();
			});

			it('should respect expire filters', async () => {
				const expire = 1e12;

				const db = new VaultDb();
				db.$remove = jest.fn(() => 0);
				db.$update = jest.fn();
				db.$find = jest.fn(() => [
					{ k: 'a.b', d: { c: 1, d: 2 }, z: 'z1' },
					{ k: 'a.b', d: { c: 1, e: 3 }, e: expire - 1, z: 'z2' },
					{ k: 'a.b', d: { c: 1, f: 4 }, e: expire, z: 'z3' },
					{ k: 'a.b', d: { c: 1, g: 5 }, e: expire + 1, z: 'z4' },
				]);
				db.emit = jest.fn();
				db.send = jest.fn();

				await db.del('a.b.c', now, expire);

				expect(db.$update).toBeCalledWith({ k: 'a.b', d: { e: 3 }, e: expire - 1, z: 'z2' });
				expect(db.$update).not.toBeCalledWith({ k: 'a.b', d: { d: 2 }, z: 'z1' });
				expect(db.$update).toBeCalledTimes(1);
				expect(db.emit).toBeCalled();
				expect(db.send).toBeCalled();
			});

			it('should wipe empty objects', async () => {
				const db = new VaultDb();
				db.$remove = jest.fn(() => 0);
				db.$removeuid = jest.fn();
				db.$find = jest.fn(() => [
					{ k: 'a.b', d: { c: 1 }, z: 'z1' },
				]);
				db.emit = jest.fn();
				db.send = jest.fn();

				await db.del('a.b.c');

				expect(db.$removeuid).toBeCalledWith('z1');
				expect(db.emit).toBeCalled();
				expect(db.send).toBeCalled();
			});
		});

		it('should skip events from argument', async () => {
			const db = new VaultDb();
			db.$remove = jest.fn(() => 1);
			db.$find = jest.fn(() => []);
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.del('a', 0, 0, true);

			expect(db.$remove).toBeCalled();
			expect(db.$find).toBeCalled();
			expect(db.emit).not.toBeCalled();
			expect(db.send).not.toBeCalled();
		});

		it('should wipe all data', async () => {
			const db = new VaultDb();
			db.$removeall = jest.fn(() => 1);
			db.emit = jest.fn();
			db.send = jest.fn();

			db.del(true, 1e12);
			expect(db.$removeall).toBeCalledWith(1e12);
			expect(db.emit).toBeCalledWith('$del');
			expect(db.send).toBeCalledWith('');
		});

		it('should wiping all data not do anything', async () => {
			const db = new VaultDb();
			db.$removeall = jest.fn(() => 0);
			db.emit = jest.fn();
			db.send = jest.fn();

			db.del(true, 1e12);
			expect(db.emit).not.toBeCalled();
			expect(db.send).not.toBeCalled();
		});
	});

	describe('clean', () => {
		it('should clean data', async () => {
			const expires = [
				{ k: 'a', z: 'z1' },
				{ k: 'b', z: 'z2' },
			];
			const dups = [
				{ k: 'b', z: 'z3' },
			];
			const db = new VaultDb();
			db.$findexpires = jest.fn(() => expires);
			db.$finddups = jest.fn(() => dups);
			db.$removeuid = jest.fn();
			db.emit = jest.fn();
			db.send = jest.fn();

			await db.clean();

			expect(db.$findexpires).toBeCalledWith(now);
			expect(db.$finddups).toBeCalled();
			expect(db.$removeuid).toBeCalledWith(['z1', 'z2', 'z3']);
			expect(db.emit).toBeCalledWith('$del');
			expect(db.send).toBeCalledWith('a');
			expect(db.send).toBeCalledWith('b');
			expect(db.send).toBeCalledTimes(2);
		});
	});

	describe('start', () => {
		it('should start the cleaner', async () => {
			const db = new VaultDb();
			db.cleaner.start = jest.fn();
			db.start();
			expect(db.cleaner.start).toBeCalled();
		});
	});

	describe('stop', () => {
		it('should stop the cleaner', async () => {
			const db = new VaultDb();
			db.cleaner.stop = jest.fn();
			db.stop();
			expect(db.cleaner.stop).toBeCalled();
		});
	});

	describe('override functions', () => {
		it('should reject', async () => {
			const db = new VaultDb();

			await expect(db.$find()).rejects.toThrow(`$find is not overloaded`);
			await expect(db.$findexpires()).rejects.toThrow(`$findexpires is not overloaded`);
			await expect(db.$finddups()).rejects.toThrow(`$finddups is not overloaded`);
			await expect(db.$rootkeys()).rejects.toThrow(`$rootkeys is not overloaded`);
			await expect(db.$insert()).rejects.toThrow(`$insert is not overloaded`);
			await expect(db.$update()).rejects.toThrow(`$update is not overloaded`);
			await expect(db.$removeuid()).rejects.toThrow(`$removeuid is not overloaded`);
			await expect(db.$removeall()).rejects.toThrow(`$removeall is not overloaded`);
			await expect(db.$remove()).rejects.toThrow(`$remove is not overloaded`);
		});
	});
});

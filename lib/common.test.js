const common = require('./common');

const now = 145172e7;
global.Date.now = () => now;
global.Math.random = () => 0.42;

jest.genMockFromModule('fs');
const fs = require('fs');

describe('common', function() {
	describe('newUid', () => {
		it('should return a uid', () => {
			expect(common.newUid()).toEqual('-K70FJ7-PPPPPPPPPPPP');
			expect(common.newUid(1e13)).toEqual('1GWDRe--PPPPPPPPPPPP');
		});

		it('should allow character list overrides', () => {
			const list = '0123456789abcdefghijklmnopqrstuvwxyz';
			expect(common.newUid(now, list)).toEqual('iiwslszkffffffffffff');
		});
	});

	describe('uidToTime', () => {
		it('should return a time', () => {
			expect(common.uidToTime('-K70FJ7-777777777777')).toEqual(now);
			expect(common.uidToTime('1GWDRe--777777777777')).toEqual(1e13);
		});

		it('should allow character list overrides', () => {
			const list = '0123456789abcdefghijklmnopqrstuvwxyz';
			expect(common.uidToTime('iiwslszkffffffffffff', list)).toEqual(now);
		});

		it('should fail gracefully', () => {
			expect(common.uidToTime()).toBeNaN();
			expect(common.uidToTime('*')).toBeNaN();
		});
	});

	describe('listBackups', () => {
		it('should return a sorted file list', async () => {
			const files = [
				'db_234.bac',
				'db_345.bak',
				'db_123.bak',
				'dba_567.bak',
			];
			jest.spyOn(fs, 'readdir').mockImplementation((path, cb) => cb(undefined, files));
			const list = await common.listBackups();
			expect(list).toEqual([
				{ id: '123', path: './db_123.bak' },
				{ id: '345', path: './db_345.bak' },
			]);
		});

		it('should take custom path', async () => {
			const files = [
				'/var/db_345.bak',
				'/var/dba_567.bak',
				'/var/dba_456.bak',
				'/var/dbb_678.bak',
			];
			jest.spyOn(fs, 'readdir').mockImplementation((path, cb) => cb(undefined, files));
			const list = await common.listBackups('/var/dba');
			expect(list).toEqual([
				{ id: '456', path: '/var/dba_456.bak' },
				{ id: '567', path: '/var/dba_567.bak' },
			]);
		});

		it('should reject on readdir failure', () => {
			const err = new Error('fail');
			jest.spyOn(fs, 'readdir').mockImplementation((path, cb) => cb(err));
			expect(common.listBackups()).rejects.toEqual(err);
		});
	});

	describe('spliceByFilter', () => {
		it('should filter', () => {
			const list = [1, 2, 2.3, 3, 3.5, 4, 5];
			const filter = v => v % 2 !== 0;

			expect(common.spliceByFilter(list, filter)).toEqual([1, 2.3, 3, 3.5, 5]);
			expect(list).toEqual([2, 4]);
		});

		it('should invert', () => {
			const list = [1, 2, 2.3, 3, 3.5, 4, 5];
			const filter = v => v % 2 === 0;

			expect(common.spliceByFilter(list, filter, true)).toEqual([1, 2.3, 3, 3.5, 5]);
			expect(list).toEqual([2, 4]);
		});
	});

	describe('padData', () => {
		it('should pad data', () => {
			expect(common.padData({
				v: 1,
			})).toEqual({
				t: now,
				v: 1,
				z: '-K70FJ7-PPPPPPPPPPPP',
			});
		});
	});
});

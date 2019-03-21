/*!
 * VaultDB ObjDb Wrapper <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const fs = require('fs');
const ObjDb = require('objdb');
const common = require('./common');
const VaultDbUse = require('./vaultdb_use');

class VaultDb extends ObjDb.Emitter {
	constructor() {
		super();

		this.cleaner = new ObjDb.Cleaner(
			async expire => (await this.$findexpires(expire)).map(({ e }) => e),
			() => this.clean(),
		);
	}

	/**
	 * @param {string} name
	 * @returns {Promise(Object)}
	 */
	async get(name) {
		if (name === '$keys') return this.$rootkeys();

		const key = name.split('$')[0];
		const list = await this.$find(key);

		const db = list.reduce((obj, { k, d }) => {
			if (common.isEmpty(d)) ObjDb.del(k, obj);
			else ObjDb.set(k, d, obj);
			return obj;
		}, {});

		return ObjDb.get(name, db);
	}

	/**
	 * @param {string} name
	 * @param {*} data
	 * @param {?number} expire
	 * @param {?string} id
	 * @returns {Promise(string)}
	 */
	async add(name, data, expire, id = common.newUid()) {
		await this.set(`${name}.${id}`, data, expire);
		return id;
	}

	/**
	 * @param {string|Object} name
	 * @param {*} data
	 * @param {?number} expire
	 * @return {Promise}
	 */
	async set(name, data, expire) {
		if (common.getType(name) === 'object') {
			return Promise.all(common.eachKey(
				name,
				(k, d, e) => this.set(k, d, e || name.$expire),
				['expire'],
			));
		}

		const now = Date.now();
		const e = expire * 1e3 + now || undefined;

		if (common.isEmpty(data)) {
			return this.del(name, now, e);
		}

		await this.$insert({
			k: name,
			d: data,
			t: now,
			e,
		});
		await this.del(name, now - 1, e - 1 || undefined, 1);

		if (e) {
			this.cleaner.setTimer(e);
		}

		this.emit('$set');
		this.send(name);
	}

	/**
	 * @param {string} name
	 * @param {?number} t time filter
	 * @param {?number} e expire filter
	 * @param {?boolean} skipEvents
	 * @returns {Promise}
	 */
	async del(name, t = Date.now() + 1, e, skipEvents) {
		let count = 0;

		if (name === true) {
			count = this.$removeall(t);
			if (count < 1) return;
			this.emit('$del');
			this.send('');
			return;
		}

		count += await this.$remove(name, t, e);

		const list = await this.$find(name, t);

		await Promise.all(list.map((row) => {
			if (common.getType(row.d) !== 'object') return;
			if (e && !row.e) return;
			if (e && row.e && row.e >= e) return;

			const changed = ObjDb.del(name.slice(row.k.length + 1), row.d);
			if (!changed) return;
			count++;

			if (common.isEmpty(row.d)) {
				return this.$removeuid(row.z);
			}
			return this.$update(row);
		}));

		if (skipEvents || count < 1) return;
		this.emit('$del');
		this.send(name);
	}

	/**
	 * @returns {Promise}
	 */
	async clean() {
		const now = Date.now();

		const list = (await Promise.all([
			this.$findexpires(now),
			this.$finddups(),
		])).reduce((a, r) => [...a, ...r], []);

		const zs = list.map(row => row.z);
		await this.$removeuid(zs);

		this.emit('$del');
		list.map(row => row.k)
			.filter((v, i, a) => a.indexOf(v) === i)
			.forEach(k => this.send(k));
	}

	start() {
		this.cleaner.start();
	}

	stop() {
		this.cleaner.stop();
	}

	/**
	 * @param {*} stream
	 * @returns {Promise}
	 */
	async restore(stream) {
		this.stop();
		await this.$removeall(true);
		await ObjDb.restore(stream, (row) => {
			return this.$insert(row);
		});
		this.start();
		await this.clean();
	}

	/**
	 * @param {*} stream
	 * @returns {Promise}
	 */
	async backup(stream) {
		await this.clean();
		// TODO: replace find true with a lighter solution
		const list = (await this.$find(true))
			.reduce((obj, row) => ({ ...obj, [row.z]: row }), {});
		await ObjDb.backup(stream, Object.keys(list), z => list[z]);
	}

	// TODO: Push this upstream
	autobackup(path, wait, limit, debug) {
		const db = this;

		if (db._autobackup) db.off('$change', db._autobackup);
		if (!(wait > 0 && limit > 0 && path)) return;
		if (!debug) debug = () => 0;

		db._autobackup = () => {
			if (db._autobackupi) return;
			db._autobackupi = 1;
			return common.delay(Math.round(wait * 1e3)).then(() => {
				let uri = `${path}_${Date.now().toString(36)}.bak`;
				let now = Date.now();
				return db.backup(uri).then(() => {
					debug(`backup: ${uri} ${Date.now() - now}ms`);
				});
			}).then(() => {
				return common.listBackups(path);
			}).then((list) => {
				list.slice(0, -limit)
					.forEach(bak => {
						debug(`removed: ${bak.path}`);
						fs.unlink(bak.path, () => 0);
					});
			}).catch(() => 0).then(() => {
				db._autobackupi = undefined;
			});
		};
		db.on('$change', db._autobackup);
	}

	// TODO: Push this upstream
	restoreBackup(path, id) {
		const db = this;

		if (!path) return Promise.reject(new Error('Invalid path'));
		if (id) return db.restore(`${path}_${id}.bak`);

		return common.listBackups(path).then((list) => {
			return db.restoreBackup(path, (list.pop() || {}).id);
		});
	}

	/**
	 * @param {Object} client
	 * @param {?string} uri
	 * @param {?string} rootkey
	 * @param {?number} depth
	 * @param {?Function} authcb
	 */
	relay(client, uri = 'data', rootkey = '', depth, authcb = () => 1) {
		if (common.getType(depth) === 'function') return this.relay(client, uri, rootkey, 2, authcb);

		client.on(`${uri}.${rootkey}$deep`, (key, data) => {
			this.set(key, data);
		});

		client.on('connect', async () => {
			await authcb();
			client.emit(`${uri}.deep`, rootkey, depth);
		});
	}

	/**
	 * @param {string} name
	 * @returns {Object}
	 */
	use(name) {
		return new VaultDbUse(this, name);
	}

	/**
	 * @param {Object|string} opts
	 * @param {string} opts.uri
	 * @param {Function|undefined} test
	 * @returns {Function}
	 */
	express(opts, test) {
		return ObjDb.Express(this, opts, test);
	}

	/**
	 * @param {Object|string} opts
	 * @param {string} opts.uri
	 * @param {number} opts.upkeep
	 * @param {Function|undefined} test
	 * @returns {Function}
	 */
	socketio(opts, test) {
		return ObjDb.Socketio(this, opts, test);
	}
	// The following need to be overloaded by implimentations
	// See: VaultDbBasic for example

	/**
	 * @param {string} name
	 * @param {?number} t time filter
	 * @return {Promise(Array)}
	 */
	async $find(name, t = 0) {
		throw new Error('$find is not overloaded');
	}

	/**
	 * @param {?number} e expire filter
	 * @return {Promise(Array)}
	 */
	async $findexpires(e = 0) {
		throw new Error('$findexpires is not overloaded');
	}

	/**
	 * @return {Promise(Array)}
	 */
	async $finddups() {
		throw new Error('$finddups is not overloaded');
	}

	/**
	 * @param {?number} t time filter
	 * @return {Promise(Array)}
	 */
	async $rootkeys(t = 0) {
		throw new Error('$rootkeys is not overloaded');
	}

	/**
	 * @param {string} data.k
	 * @param {*} data.d
	 * @param {?string} data.z
	 * @param {?number} data.e
	 * @return {Promise(Object)}
	 */
	async $insert(data) {
		throw new Error('$insert is not overloaded');
	}

	/**
	 * @param {Object} data
	 * @param {string} data.k
	 * @param {*} data.d
	 * @param {string} data.z
	 * @param {?number} data.e
	 * @return {Promise(Object)}
	 */
	async $update(data) {
		throw new Error('$update is not overloaded');
	}

	/**
	 * @param {String|Array} zs
	 * @return {Promise(number)}
	 */
	async $removeuid(zs) {
		throw new Error('$removeuid is not overloaded');
	}

	/**
	 * @param {?number} t time filter
	 * @return {Promise(number)}
	 */
	async $removeall(t = Date.now()) {
		throw new Error('$removeall is not overloaded');
	}

	/**
	 * @param {string} name
	 * @param {?number} t time filter
	 * @param {?number} e expire fitler
	 * @return {Promise(number)}
	 */
	async $remove(name, t = 0, e = 0) {
		throw new Error('$remove is not overloaded');
	}
}

exports = module.exports = VaultDb;

exports.common = common;

/*!
 * VaultDB ObjDb Wrapper <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const fs = require('fs');
const ObjDb = require('objdb');
const common = require('./common');

class VaultDb extends ObjDb.Emitter {
	constructor() {
		super();

		this._rootkeys = [];
		this.cleaner = new ObjDb.Cleaner(
			expire => this.$findexpires(expire).map(([n, e]) => e),
			() => this.clean(),
		);
		common.delay(ObjDb.EMIT_DELAY).then(() => {
			return this.$rootkeys();
		}).then((list) => {
			list.forEach(key => this.send(key));
			return this.cleaner.setTimer();
		});
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
	async add(name, data, expire, id) {
		if (!id) id = common.newUid();

		await this.set(`${name}.${id}`, data, expire);
		return id;
	}

	/**
	 * @param {string} name
	 * @param {*} data
	 * @param {?number} expire
	 * @return {Promise}
	 */
	async set(name, data, expire) {
		let now = Date.now();
		let e = expire * 1e3 + now || undefined;

		if (!expire && common.isEmpty(data)) return this.del(name);

		await this.$insert({
			k: name,
			d: data,
			t: now,
			e,
		});

		if (!expire) return this.del(name, now, undefined, 1);
		await this.del(name, now, e, 1);

		if (expire) this.setClean(expire);
		this.emit('$set');
		this.trigger(name);
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
			if (!isNaN(count) && count < 1) return;
			this.emit('$del');
			this.trigger(true);
			return;
		}

		count += await this.$remove(name, t, e);

		const list = await this.$find(name, t);
		const updates = [
			Promise.resolve(),
		];

		list.forEach((row) => {
			if (!(row.d instanceof Object)) return;
			if (e && row.e && row.e <= e) return;

			const changed = ObjDb.del(name.slice(row.k.length + 1), row.d);
			if (!changed) return;
			count++;

			if (Object.keys(row.d).length < 1) {
				updates.push(this.$removeuid(row.z));
			} else {
				updates.push(this.$update(row));
			}
		});

		await Promise.all(updates);

		if (skipEvents || count < 1) return;
		this.emit('$del');
		this.send(name);
	}

	/**
	 * @returns {Promise}
	 */
	async clean() {
		const now = Date.now();

		const list = [].concat(
			await Promise.all([
				this.$findexpires(now),
				this.$finddups(),
			]),
		);

		const zs = list.map(row => row.z);
		await this.$removeuid(zs);

		this.emit('$del');
		list.map(row => row.k)
			.filter((v, i, a) => a.indexOf(v) === i)
			.forEach(k => this.trigger(k));
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
		let now = Date.now();

		await this.del(true);
		await ObjDb.restore(stream, (res) => {
			return this.set(res.k, res.d, res.e ? (res.e - now) / 1e3 : undefined);
		});
		await this.clean();
	}

	/**
	 * @param {*} stream
	 * @returns {Promise}
	 */
	async backup(stream) {
		await this.clean();
		const list = await this.$find(true);
		await ObjDb.backup(stream, list);
	}

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

	use(name) {
		const VaultDbUse = require('./vaultdb_use');
		return new VaultDbUse(this, name);
	}

	/**
	 * @param {string} name
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $find(name, t) {
		throw new Error('$find is not overloaded');
	}

	/**
	 * @param {?number} e
	 * @return {Promise(Array)}
	 */
	async $findexpires(e) {
		throw new Error('$findexpires is not overloaded');
	}

	/**
	 * @return {Promise(Array)}
	 */
	async $finddups() {
		throw new Error('$finddups is not overloaded');
	}

	/**
	 * @param {number} t
	 * @return {Promise(Array)}
	 */
	async $rootkeys(t) {
		throw new Error('$rootkeys is not overloaded');
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	async $insert(data) {
		throw new Error('$insert is not overloaded');
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	async $update(data) {
		throw new Error('$update is not overloaded');
	}

	/**
	 * @param {Array} zs
	 * @return {Promise(number)}
	 */
	async $removeuid(zs) {
		throw new Error('$removeuid is not overloaded');
	}

	/**
	 * @param {number} t
	 * @return {Promise(number)}
	 */
	async $removeall(t) {
		throw new Error('$removeall is not overloaded');
	}

	/**
	 * @param {string} name
	 * @param {number} t
	 * @param {number} e
	 * @return {Promise(number)}
	 */
	async $remove(name, t, e) {
		throw new Error('$remove is not overloaded');
	}
}

exports = module.exports = VaultDb;

exports.common = common;

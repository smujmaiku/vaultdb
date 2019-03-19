
/*!
 * VaultDB Basic Implimentation <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const VaultDb = require('./vaultdb');
const common = require('./common');

/**
 * @param {Array} db
 * @param {Function} filter
 * @returns {Array}
 */
const removeByFilter = (db, filter) => {
	const list = db.map(filter)
		.map((v, i) => v ? i : -1)
		.filter(i => i >= 0);

	return list.reverse()
		.map(i => db.splice(i, 1)[0])
		.reverse();
};

class VaultDbBasic extends VaultDb {
	/**
	 * @param {?Array|String} db
	 */
	constructor(db) {
		super();
		this._db = [];

		switch (common.getType(db)) {
		case 'array':
			this._db = db;
			break;
		case 'string':
			this.restore(db);
			break;
		}
	}

	/**
	 * @param {string} name
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $find(name, t = 0) {
		let res = [].concat(this._db);
		if (name !== true) res = res.filter(row => name === row.k || name.startsWith(`${row.k}.`) || row.k.startsWith(`${name}.`));
		if (t > 1) res = res.filter(row => row.t < t);
		return res.sort((a, b) => a.t - b.t);
	}

	/**
	 * @param {string|Array} zs
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $findids(zs, t = 0) {
		zs = [].concat(zs);

		let res = this._db.filter(row => zs.indexOf(row.z) >= 0);
		if (t > 0) res = res.filter(row => row.t < t);
		return res;
	}

	/**
	 * @param {?number} e
	 * @return {Promise(Array)}
	 */
	async $findexpires(e = 0) {
		if (e) return this._db.filter(row => row.e < e);
		return this._db.filter(row => row.e > 0);
	}

	/**
	 * @return {Promise(Array)}
	 */
	async $finddups() {
		let res = this._db.filter(row => !row.e)
			.sort((b, a) => a.t - b.t);
		const keys = res.map(row => row.k);
		return res.filter((row, i) => keys.indexOf(row.k) > i);
	}

	/**
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $listkeys(t = 0) {
		let keys = this._db.map(row => row.k)
			.filter((v, i, a) => a.indexOf(v) === i);
		if (t > 0) keys = keys.filter(row => row.t < t);
		return keys;
	}

	/**
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $rootkeys(t = 0) {
		const list = await this.$listkeys(t);

		return list.map(k => k.split('.')[0])
			.filter((v, i, a) => a.indexOf(v) === i);
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	async $insert(data) {
		this._db.push(common.padData(data));
		return data;
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	async $update(data) {
		this._db.forEach((row) => {
			if (row.z !== data.z) return;
			Object.assign(row, data);
		});

		return data;
	}

	/**
	 * @param {String|Array} zs
	 * @return {Promise(Number)}
	 */
	async $removeuid(zs) {
		if (common.getType(zs) !== 'array') return this.$removeuid([zs]);

		const filter = row => zs.indexOf(row.z) >= 0;
		return removeByFilter(this._db, filter).length;
	}

	/**
	 * @param {?number} t
	 * @return {Promise(Number)}
	 */
	async $removeall(t = Date.now()) {
		const filter = row => row.t < t;
		return removeByFilter(this._db, filter).length;
	}

	/**
	 * @param {string} name
	 * @param {?number} t
	 * @param {?number} e
	 * @return {Promise(number)}
	 */
	async $remove(name, t = 0, e = 0) {
		const filter = (row) => {
			if (common.getType(row) !== 'object') return true;
			if (e > 0 && row.e && row.e <= e) return false;
			if (t > 0 && row.t >= t) return false;
			if (name === row.k || row.k.startsWith(`${name}.`)) return true;
			return false;
		};
		return removeByFilter(this._db, filter).length;
	}
}

module.exports = VaultDbBasic;

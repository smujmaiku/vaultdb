
/*!
 * VaultDB Basic Implimentation <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const VaultDb = require('./vaultdb');
const common = require('./common');

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
		const list = [...this._db];

		if (name !== true) {
			common.spliceByFilter(
				list,
				row => name === row.k || name.startsWith(`${row.k}.`) || row.k.startsWith(`${name}.`),
				true,
			);
		}
		if (t > 0) {
			common.spliceByFilter(list, row => row.t < t, true);
		}
		return list.sort((a, b) => a.t - b.t);
	}

	/**
	 * @param {string|Array} zs
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $findids(zs, t = 0) {
		if (common.getType(zs) !== 'array') return this.$findids([zs], t);

		const list = this._db
			.filter(row => zs.includes(row.z));

		if (t > 0) {
			common.spliceByFilter(list, row => row.t < t, true);
		}
		return list.sort((a, b) => a.t - b.t);
	}

	/**
	 * @param {?number} e
	 * @return {Promise(Array)}
	 */
	async $findexpires(e = 0) {
		const list = this._db
			.filter(row => row.e > 0);

		if (e) {
			common.spliceByFilter(list, row => row.e < e, true);
		}

		return list;
	}

	/**
	 * @return {Promise(Array)}
	 */
	async $finddups() {
		const list = this._db.filter(row => !row.e).sort((a, b) => a.t - b.t);
		const keys = list.map(row => row.k);
		return list.filter((row, i) => keys.indexOf(row.k) !== i);
	}

	/**
	 * @param {?number} t
	 * @return {Promise(Array)}
	 */
	async $listkeys(t = 0) {
		const list = [...this._db];

		if (t > 0) {
			common.spliceByFilter(list, row => row.t < t, true);
		}

		return list
			.map(row => row.k)
			.filter((v, i, a) => a.indexOf(v) === i);
		;
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
		const row = common.padData(data);
		this._db.push(row);
		return row;
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	async $update(data) {
		return this._db.filter((row) => {
			if (row.z !== data.z) return;
			Object.assign(row, data);
			return row;
		})[0];
	}

	/**
	 * @param {String|Array} zs
	 * @return {Promise(Number)}
	 */
	async $removeuid(zs) {
		if (common.getType(zs) !== 'array') return this.$removeuid([zs]);

		const filter = row => zs.indexOf(row.z) >= 0;
		return common.spliceByFilter(this._db, filter).length;
	}

	/**
	 * @param {?number} t
	 * @return {Promise(Number)}
	 */
	async $removeall(t = Date.now()) {
		const filter = row => row.t < t;
		return common.spliceByFilter(this._db, filter).length;
	}

	/**
	 * @param {string} name
	 * @param {?number} t
	 * @param {?number} e
	 * @return {Promise(number)}
	 */
	async $remove(name, t = 0, e = 0) {
		const filter = (row) => {
			if (e > 0 && (!row.e || e < row.e)) return false;
			if (t > 0 && t < row.t) return false;
			if (name === row.k || row.k.startsWith(`${name}.`)) return true;
			return false;
		};
		return common.spliceByFilter(this._db, filter).length;
	}
}

module.exports = VaultDbBasic;

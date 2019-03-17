/*!
 * VaultDb <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const TRANSLATE_LIST = [
	'on',
	'once',
	'off',
	'onDeep',
	'emit',
	'trigger',
	'get',
	'set',
	'add',
	'broadcast',
	'del',
];

const RELAY_LIST = [
	'express',
	'socketio',
	'relay',
];

class VaultUse {
	constructor(db, key) {
		this._db = db;
		this._usekey = key;

		TRANSLATE_LIST.forEach(fn => {
			this[fn] = (k, ...args) => db[fn](`${key}.${k}`, ...args);
		});
		RELAY_LIST.forEach(fn => {
			this[fn] = db[fn].bind(this);
		});
	}
}

module.exports = VaultUse;

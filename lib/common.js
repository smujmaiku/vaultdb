/*!
 * VaultDb <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const fs = require('fs');
const common = require('objdb').common;

const UID_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const UID_TIME_LENGTH = 8;
const UID_RANDOM_LENGTH = 12;

const fsReaddir = dir => new Promise((resolve, reject) => fs.readdir(dir, (err, files) => {
	if (err) return reject(err);
	return resolve(files);
}));

/**
 * @param {?number} now
 * @param {?string} chars
 * @returns {string}
 */
function newUid(now = Date.now(), chars = UID_CHARS) {
	const size = chars.length;

	return [
		...Array(UID_TIME_LENGTH).fill(0)
			.map((v) => {
				v = chars.charAt(now % size);
				now = Math.floor(now / size);
				return v;
			}).reverse(),
		...Array(UID_RANDOM_LENGTH).fill(0)
			.map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
			.reverse(),
	].join('');
}

/**
 * @param {string} uid
 * @param {?string} chars
 * @returns {number}
 */
function uidToTime(uid, chars = UID_CHARS) {
	if (common.getType(uid) !== 'string') return NaN;
	const size = chars.length;

	return uid.split('').slice(0, UID_TIME_LENGTH).reduce((t, v) => {
		let i = chars.indexOf(v);
		if (i < 0) return NaN;
		return t * size + i;
	}, 0);
}

/**
 * @param {?string} path
 * @returns {Promise(Array)}
 */
async function listBackups(path = './db') {
	const dir = path.slice(0, path.lastIndexOf('/'));
	const file = path.slice(dir.length + 1);

	const files = await fsReaddir(dir);
	return files
		.map(f => (f.match(new RegExp(`(^|\\W)${file}_(.+)[.]bak$`)) || [])[2])
		.filter(v => v)
		.sort()
		.map(id => ({
			id: id,
			path: `${path}_${id}.bak`,
		}));
}

/**
 * @param {Array} list
 * @param {Function} filter
 * @returns {Array}
 */
function spliceByFilter(list, filter) {
	return list.map(filter)
		.map((v, i) => v ? i : -1)
		.filter(i => i >= 0)
		.map((v, i) => list.splice(v - i, 1)[0]);
};

/**
 * @param {Object} data
 * @returns {Object}
 */
function padData(data) {
	return {
		t: Date.now(),
		...data,
		z: newUid(),
	};
}

module.exports = {
	...common,
	UID_CHARS,
	newUid,
	uidToTime,
	listBackups,
	spliceByFilter,
	padData,
};

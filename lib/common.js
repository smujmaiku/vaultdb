/*!
 * VaultDb <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const fs = require('fs');
const ObjDb = require('objdb');

const UID_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/**
 * @param {number} now
 * @param {string} chars
 * @returns {string}
 */
function newUid(now = Date.now(), chars = UID_CHARS) {
	return [
		...Array(8).fill(0)
			.map((v) => {
				v = chars.charAt(now % chars.length);
				now = Math.floor(now / chars.length);
				return v;
			}).reverse(),
		...Array(12).fill(0)
			.map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
			.reverse(),
	].join('');
}

/**
 * @param {string} uid
 * @param {string} chars
 * @returns {number}
 */
function uidToTime(uid = '', chars = UID_CHARS) {
	return uid.split('').slice(0, 8).reduce((t, v) => {
		let i = chars.indexOf(v);
		if (i < 0) return NaN;
		return t * chars.length + i;
	}, 0);
}

function listBackups(path) {
	let dir = path.slice(0, path.lastIndexOf('/'));
	let file = path.slice(dir.length + 1);

	return new Promise((resolve, reject) => {
		fs.readdir(dir, (err, files) => {
			if (err) return reject(err);
			let list = files
				.map(f => (f.match(new RegExp(`(^|\\W)${file}_(.+)[.]bak$`)) || [])[1])
				.filter(v => v)
				.sort()
				.map(id => ({
					id: id,
					path: `${path}_${id}.bak`,
				}));
			resolve(list);
		});
	});
}

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
	...ObjDb.common,
	UID_CHARS,
	newUid,
	uidToTime,
	listBackups,
	padData,
};

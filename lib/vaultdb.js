/*!
 * VaultDB ObjDb Wrapper <https://github.com/smujmaiku/vaultdb>
 * Copyright(c) 2017-2019 Michael Szmadzinski
 * MIT Licensed
 */

const fs = require('fs');
const ObjDb = require('objdb');

const UID_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

const delay = t => new Promise(resolve => setTimeout(resolve, t));

const newUid = (now = Date.now(), chars = UID_CHARS) => [].concat(
	Array(8).fill(0).map((v) => {
		v = chars.charAt(now % chars.length);
		now = Math.floor(now / chars.length);
		return v;
	}).reverse(),
	Array(12).fill(0).map(() => chars.charAt(Math.floor(Math.random() * chars.length))).reverse()
).join('');

const uidToTime = (uid = '', chars = UID_CHARS) => {
	return uid.split('').slice(0, 8).reduce((t, v) => {
		let i = chars.indexOf(v);
		if (i < 0) return NaN;
		return t * chars.length + i;
	}, 0);
};

const listBackups = (path) => {
	let dir = path.slice(0, path.lastIndexOf('/'));
	let file = path.slice(dir.length + 1);

	return new Promise((resolve, reject) => {
		fs.readdir(dir, (err, files) => {
			if (err) return reject(err);
			let list = files
				.map(f => (f.match(new RegExp(`${file}_(.+).bak$`)) || [])[1])
				.filter(v => v)
				.sort()
				.map(id => ({
					id: id,
					path: `${path}_${id}.bak`,
				}));
			resolve(list);
		});
	});
};

const padData = (data) => {
	return Object.assign({
		t: Date.now(),
	}, data, {
		z: newUid(),
	});
};

const getBody = (req) => new Promise((resolve, reject) => {
	let body = Buffer.from([]);
	req.on('data', chunk => { body = Buffer.concat([body, chunk]); });
	req.on('error', reject);
	req.on('end', () => resolve(body));
});

class VaultDb {
	constructor(db) {
		this._db = db instanceof Array ? db : [];
		if (typeof db === 'string') this.restore(db);

		this._rootkeys = [];
		delay(VaultDb.emitWait).then(() => {
			return this.$rootkeys();
		}).then((list) => {
			list.forEach((key) => this.trigger(key));
			return this.setClean(VaultDb.emitWait);
		});
	}

	on(name, cb) {
		const db = this;

		if (name instanceof Array) return name.forEach(n => db.on(n, cb));
		if (!name || typeof name !== 'string') return;
		if (name.match(/[\s,]/)) return name.split(/[\s,]/g).forEach(n => db.on(n, cb));
		if (cb instanceof Function) {
			db['_on' + name] = db['_on' + name] || [];
			db['_on' + name].push(cb);
		}

		db.get(name).then((res) => {
			if (ObjDb.isUndefined(res)) return;
			cb(res);
		});
		return db;
	}

	once(name, cb) {
		const db = this;

		let ocb = (res) => {
			db.off(name, ocb);
			cb(res);
		};
		return db.on(name, ocb);
	}

	off(name, cb) {
		const db = this;

		if (name === true) {
			Object.keys(db).forEach((key) => {
				if (key.startsWith('_on')) return db.off(key.slice(3), cb || true);
			});
		} else if (typeof name !== 'string' || !(db['_on' + name] instanceof Array)) {
			// Nothing
		} else if (cb === true) {
			db['_on' + name].forEach((c) => {
				db.off(name, c);
			});
		} else {
			db['_on' + name] = db['_on' + name].filter((c) => {
				if (c instanceof Function && c !== cb) return true;
				if (!c) return false;
				c._done = true;
				if (c._clean) c._clean();
			});
		}

		return db;
	}

	deep(name, depth, cb) {
		if (!(cb instanceof Function)) return this;

		const db = this;
		let clean = [];

		/* jshint -W018 */
		if (!(depth > 0)) depth = 1;
		if (name) depth = depth + name.split('.').length;
		else name = '';

		cb._clean = () => {
			clean.forEach(c => db.off(c[0], c[1]));
		};

		const on = (key, cb) => {
			if (cb._done) return;
			clean.push([key, cb]);
			db.on(key, cb);
		};

		const ondata = (key, data) => {
			cb(key, data);
		};

		const onkeys = (key, keys) => {
			let list = [];

			keys.forEach((k) => {
				if (key) k = `${key}.${k}`;
				if (k.split('.').length >= depth) {
					if (clean.map(([k]) => k).indexOf(k) >= 0) return;
					on(k, ondata.bind(db, name ? k.slice(name.length + 1) : k));
					list.push(k);
				} else {
					if (clean.map(([k]) => k).indexOf(`${k}$keys`) >= 0) return;
					on(`${k}$keys`, onkeys.bind(db, k));
					list.push(`${k}$keys`);
				}
			});
		};

		on(`${name}$keys`, onkeys.bind(db, name));

		db[`_on${name}$deep`] = (db[`_on${name}$deep`] || []);
		db[`_on${name}$deep`].push(cb);

		return db;
	}

	emit(name, data) {
		const db = this;

		if (typeof name !== 'string') return db;

		let ekey = `_emit_${name}`; let akey = `_emitagain_${name}`;
		db[akey] = true;
		if (db[ekey]) return;
		delete db[akey];

		const _send = (d) => {
			if (d instanceof Function) return data().then(_send);

			(db[`_on${name}`] || []).forEach(cb => cb(d));

			let keys = Object.keys(d || {});
			let _keys = keys.sort().join(',');
			if (db[`_keys${name}`] !== _keys) {
				(db[`_on${name}$keys`] || []).forEach(cb => cb(keys));
				db[`_keys${name}`] = _keys;
			}

			delete db[ekey];
			if (db[akey]) db.emit(name, data);
		};

		clearTimeout(db[ekey]);
		db[ekey] = setTimeout(_send.bind(db, data), VaultDb.emitWait);

		return db;
	}

	trigger(name) {
		const db = this;

		if (typeof name !== 'string') return db;
		db.emit('$change');
		let t = Date.now();

		let list = Object.keys(db)
			.filter(n => n.startsWith('_on') && db[n].length > 0)
			.map(n => n.slice(3).split('$').shift())
			.filter(n => n === name || n.startsWith(`${name}.`) || name.startsWith(`${n}.`))
			.filter((v, i, a) => a.indexOf(v) === i)
			.sort();

		let cache = {};

		let _get = (n) => {
			let list = Object.keys(cache).filter(k => k === n || n.startsWith(`${k}.`));
			if (list.indexOf(n) >= 0) return cache[n];
			if (list.length > 0) {
				let k = list[0];
				let toget = cache[k];
				n = n.slice(k.length + 1);
				return toget.then(d => ObjDb.get(n, d));
			}
			cache[n] = db.get(n);
			return cache[n];
		};

		list.forEach(n => db.emit(n, _get.bind(db, n), t));

		let rootkey = name.split('.').shift();
		if (db._rootkeys.indexOf(rootkey) < 0) {
			db._rootkeys.push(rootkey);
			(db[`_on$keys`] || []).forEach(cb => cb(db._rootkeys));
		}

		return db;
	}

	get(name) {
		const db = this;
		if (name === '$keys') return db.$rootkeys();

		return db.$find(name.split('$')[0]).then((res) => {
			let d = {};
			res.forEach(v => {
				if (ObjDb.isEmpty(v)) ObjDb.del(v.k, d);
				else ObjDb.set(v.k, v.d, d);
			});
			return ObjDb.get(name, d);
		});
	}

	add(name, data, expire, id) {
		const db = this;
		if (!id) id = newUid();

		return db.set(`${name}.${id}`, data, expire).then(() => ({ [id]: data }));
	}

	set(name, data, expire) {
		const db = this;

		let t = Date.now();
		let e = expire * 1e3 + t || undefined;

		if (!expire && ObjDb.isEmpty(data)) return db.del(name);

		return db.$insert({
			k: name,
			d: data,
			t: t,
			e: e,
		}).then(() => {
			if (!expire) return db.del(name, t, undefined, 1);
			return db.del(name, t, e, 1);
		}).then(() => {
			if (expire) db.setClean(expire);
			db.emit('$set');
			db.trigger(name);
		});
	}

	del(name, t, e, skip) {
		const db = this;
		t = t || (Date.now() + 1);

		if (name === true) {
			return db.$removeall(t).then((c) => {
				if (!isNaN(c) && c < 1) return;
				db.emit('$del');
				db.trigger(true);
			});
		}

		let count = 0;
		return db.$remove(name, t, e).then((c) => {
			count += c;
			return db.$find(name, t);
		}).then((list) => {
			let updates = [Promise.resolve()];

			list.forEach((row) => {
				if (!(row.d instanceof Object)) return;
				if (e && row.e && row.e <= e) return;

				let changed = ObjDb.del(name.slice(row.k.length + 1), row.d);
				if (!changed) return;
				count++;

				if (Object.keys(row.d).length < 1) {
					updates.push(db.$removeuid(row.z));
				} else {
					updates.push(db.$update(row));
				}
			});

			return Promise.all(updates);
		}).then(() => {
			if (skip) return;
			if (!isNaN(count) && count < 1) return;
			db.emit('$del');
			db.trigger(name);
		});
	}

	setClean(expire) {
		const db = this;
		if (db._end) return;

		let now = Date.now();

		if (typeof expire !== 'number' || isNaN(expire)) {
			if (db._cleani) return;

			expire = now + 1e5;
			return db.$findexpires(expire).then((res) => {
				expire = res.reduce((v, row) => Math.min(v, row.e), expire);
				db.setClean(Math.ceil((expire - Date.now()) / 1e3) || 1);
			});
		}

		expire = Math.ceil(Math.max(1, expire));
		if ('_expiret' in db && expire * 1e3 > db._expiret - now) return;

		clearTimeout(db._expirei);
		db._expiret = expire * 1e3 + now;
		db._expirei = setTimeout(db.clean.bind(db), Math.max(VaultDb.expireWait, db._expiret - now));
	}

	clean() {
		const db = this;
		clearTimeout(db._expirei);

		let now = Date.now();

		return Promise.all([
			db.$findexpires(now),
			db.$finddups(),
		]).then(([expires, dups]) => {
			let res = [].concat(expires, dups);
			let list = res.map(row => row.k)
				.filter((v, i, a) => a.indexOf(v) === i);
			let zs = res.map(row => row.z);
			return db.$removeuid(zs).then(() => {
				db.emit('$del');
				list.forEach(r => db.trigger(r));
			});
		}).catch().then(() => {
			clearTimeout(db._expirei);
			delete db._expiret;
			delete db._expirei;
			db.setClean();
		});
	}

	start() {
		const db = this;

		delete db._end;
		db.clean();
	}

	end() {
		const db = this;

		db._end = true;
		return db.clean().then(() => {
			clearTimeout(db._expirei);
			delete db._expiret;
			delete db._expirei;
		});
	}

	restore(stream) {
		const db = this;
		const set = db.set.bind(db); const clean = db.clean.bind(db);
		let now = Date.now();

		return db.del(true).then(() => {
			return ObjDb.restore(stream, (res) => {
				return set(res.k, res.d, res.e ? (res.e - now) / 1e3 : undefined);
			});
		}).then(() => clean());
	}

	backup(stream) {
		const db = this;

		const $find = db.$find.bind(db);
		return db.clean()
			.then(() => $find(true))
			.then(list => ObjDb.backup(stream, list));
	}

	autobackup(path, wait, limit, debug) {
		const db = this;

		if (db._autobackup) db.off('$change', db._autobackup);
		if (!(wait > 0 && limit > 0 && path)) return;
		if (!debug) debug = () => 0;

		db._autobackup = () => {
			if (db._autobackupi) return;
			db._autobackupi = 1;
			return delay(Math.round(wait * 1e3)).then(() => {
				let uri = `${path}_${Date.now().toString(36)}.bak`;
				let now = Date.now();
				return db.backup(uri).then(() => {
					debug(`backup: ${uri} ${Date.now() - now}ms`);
				});
			}).then(() => {
				return listBackups(path);
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

		return listBackups(path).then((list) => {
			return db.restoreBackup(path, (list.pop() || {}).id);
		});
	}

	expressjs(baseuri, testCb) {
		if (baseuri instanceof Function) return this.expressjs(undefined, testCb);
		if (!baseuri) baseuri = '/api/data';
		if (!baseuri.endsWith('/')) baseuri += '/';
		if (!(testCb instanceof Function)) testCb = () => 1;

		const db = this;

		return (req, res, next) => {
			if (req._parsedUrl.pathname === baseuri.slice(0, -1)) return res.status(301).header('location', `${baseuri}$keys`).end();
			if (!req._parsedUrl.pathname.startsWith(baseuri)) return next();
			let [path, meta] = req._parsedUrl.pathname.slice(baseuri.length).split('$');
			let expire = req.get('meta-expire') || undefined;
			let key = path.replace('/', '.');
			let method = {
				get: 'get',
				post: 'add',
				put: 'set',
				cast: 'broadcast',
				delete: 'del',
			}[req.method.toLowerCase()];

			if (!method) return res.status(405).end();
			if (!key && !meta) return res.status(301).header('location', `${baseuri}$keys`).end();
			if (path.length > 1 && path.slice(-1) === '/') return res.redirect(301, `${baseuri}${path.slice(0, -1)}`);
			if (path.length > 1 && path.slice(-6) === '/$keys') return res.redirect(301, `${baseuri}${path.slice(0, -6)}$keys`);

			Promise.resolve(testCb(req, method, key, meta)).then((allow) => {
				if (allow) return allow;
				if (method === 'broadcast') return testCb(req, 'set', key, meta);
			}).then((allow) => {
				if (!allow) return res.status(401).end();

				switch (method) {
				case 'get':
					return db.get(`${key}${meta ? '$' + meta : ''}`).then((data) => {
						if (data === undefined) return res.status(404).end();
						res.json(data).end();
					});

				case 'add':
					return db.add(key, req.body, expire).then((data) => {
						res.json(data).end();
					});

				case 'set':
					return db.set(key, req.body, expire).then((data) => {
						res.json(data).end();
					});

				case 'broadcast':
					return db.set(key, req.body, 1).then((data) => {
						res.json(data).end();
					});

				case 'del':
					return db.del(key).then((data) => {
						res.json(data).end();
					});
				}

				return res.status(400).end();
			}).catch(() => res.status(500).end());
		};
	}

	socketio(baseuri, testCb) {
		const db = this;

		if (baseuri instanceof Function) return this.socketio(undefined, testCb);
		if (!baseuri) baseuri = 'data';
		if (!baseuri.endsWith('.')) baseuri += '.';
		if (!(testCb instanceof Function)) testCb = () => 1;

		return (socket, next) => {
			const cbs = {};

			const ioOn = (list) => {
				[].concat(list || []).forEach((key) => {
					if (cbs[key]) return db.once(key, cbs[key]);
					cbs[key] = (data) => {
						Promise.resolve(testCb(socket, 'get', key)).then((allow) => {
							if (!allow) return;
							socket.emit(`${baseuri}${key}`, data);
						});
					};
					db.on(key, cbs[key]);
				});
			};

			const ioOff = (list) => {
				if (list === true) list = Object.keys(cbs);
				[].concat(list || []).forEach((key) => {
					db.off(key, cbs[key]);
					delete cbs[key];
				});
			};

			const ioOnce = (list) => {
				[].concat(list || []).forEach((key) => {
					Promise.resolve(testCb(socket, 'get', key)).then((allow) => {
						if (!allow) return Promise.reject(new Error('Not allowed'));
						return db.get(key);
					}).then((data) => {
						socket.emit(`${baseuri}${key}`, data);
					}).catch(() => 0);
				});
			};

			const ioDeep = (list, depth) => {
				[].concat(list).forEach((key) => {
					ioOff(`${key}$deep`, cbs[`${key}$deep`]);
					cbs[`${key}$deep`] = (k, data) => {
						Promise.resolve(testCb(socket, 'get', `${key}.${k}`)).then((allow) => {
							if (!allow) return;
							socket.emit(`${baseuri}${key}$deep`.replace('.$', '$'), k, data);
						});
					};
					db.deep(key, depth, cbs[`${key}$deep`]);
				});
			};

			socket[`_vaultDb_${baseuri.slice(0, -1)}`] = {
				on: ioOn,
				off: ioOff,
				once: ioOnce,
				deep: ioDeep,
			};

			socket.on(`${baseuri}on`, ioOn);
			socket.on(`${baseuri}off`, ioOff);
			socket.on(`${baseuri}once`, ioOnce);
			socket.on(`${baseuri}deep`, ioDeep);

			socket.on(`${baseuri}get`, (key, cb) => {
				if (!(cb instanceof Function)) return;

				Promise.resolve(testCb(socket, 'get', key)).then((allow) => {
					if (!allow) return Promise.reject(new Error('Not allowed'));
					return db.get(key);
				}).then((data) => {
					cb(data);
				}).catch(() => cb(undefined));
			});

			socket.on(`${baseuri}add`, (data) => {
				Object.entries(data).forEach(([k, d]) => {
					if (k.indexOf('$') >= 0) return undefined;
					Promise.resolve(testCb(socket, 'add', k)).then((allow) => {
						if (!allow) return;
						db.add(k, d, data[`${k}$expire`] || data.$expire);
					});
				});
			});

			socket.on(`${baseuri}set`, (data) => {
				Object.entries(data).forEach(([k, d]) => {
					if (k.indexOf('$') >= 0) return undefined;
					Promise.resolve(testCb(socket, 'set', k)).then((allow) => {
						if (!allow) return;
						db.set(k, d, data[`${k}$expire`] || data.$expire);
					});
				});
			});

			socket.on(`${baseuri}broadcast`, (data) => {
				Object.entries(data).forEach(([k, d]) => {
					if (k.indexOf('$') >= 0) return undefined;
					Promise.resolve(testCb(socket, 'broadcast', k)).then((allow) => {
						if (allow) return allow;
						return testCb(socket, 'set', k);
					}).then((allow) => {
						if (!allow) return;
						db.set(k, d, 1);
					});
				});
			});

			socket.on(`${baseuri}del`, (data) => {
				[].concat(data || []).forEach((k) => {
					Promise.resolve(testCb(socket, 'del', k)).then((allow) => {
						if (!allow) return;
						db.del(k);
					});
				});
			});

			socket.on('disconnect', () => {
				ioOff(true);
			});

			next();
		};
	}

	relay(client, uri, rootkey, depth, authcb) {
		uri = uri || 'data';
		rootkey = rootkey || '';
		if (depth instanceof Function) return this.relay(client, uri, rootkey, 2, authcb);
		authcb = authcb || (() => 1);

		const db = this;

		client.on(`${uri}.${rootkey}$deep`, (key, data) => {
			db.set(key, data);
		});

		client.on('connect', () => {
			Promise.resolve(authcb()).then(() => {
				client.emit(`${uri}.deep`, rootkey, depth);
			});
		});
	}

	use(name) {
		return new VaultUse(this, name);
	}

	/**
	 * @param {string} name
	 * @param {number} t
	 * @return {Promise(Array)}
	 */
	$find(name, t) {
		const db = this._db;

		let res = [].concat(db);
		if (name !== true) res = res.filter(row => name === row.k || name.startsWith(`${row.k}.`) || row.k.startsWith(`${name}.`));
		if (t) res = res.filter(row => row.t < t);
		return Promise.resolve(res.sort((a, b) => a.t - b.t));
	}

	/**
	 * @param {Array} zs
	 * @param {number} t
	 * @return {Promise(Array)}
	 */
	$findids(zs, t) {
		const db = this._db;
		zs = [].concat(zs || []);

		let res = db.filter(row => zs.indexOf(row.z) >= 0);
		if (t) res = res.filter(row => row.t < t);
		return Promise.resolve(res);
	}

	/**
	 * @param {number} e
	 * @return {Promise(Array)}
	 */
	$findexpires(e) {
		const db = this._db;

		let res = [].concat(db);
		if (e) res = db.filter(row => row.e < e);
		else res = db.filter(row => row.e > 0);

		return Promise.resolve(res);
	}

	/**
	 * @return {Promise(Array)}
	 */
	$finddups() {
		const db = this._db;

		let res = [].concat(db)
			.filter(row => !row.e)
			.sort((b, a) => a.t - b.t);
		let keys = res.map(row => row.k);
		res = res.filter((row, i) => keys.indexOf(row.k) > i);

		return Promise.resolve(res);
	}

	/**
	 * @param {number} t
	 * @return {Promise(Array)}
	 */
	$listkeys(t) {
		const db = this._db;

		let keys = db.map(row => row.k)
			.filter((v, i, a) => a.indexOf(v) === i);
		if (t) keys = keys.filter(row => row.t < t);
		return Promise.resolve(keys);
	}

	/**
	 * @param {number} t
	 * @return {Promise(Array)}
	 */
	$rootkeys(t) {
		return this.$listkeys(t).then((res) => {
			return res.map(k => k.split('.')[0])
				.filter((v, i, a) => a.indexOf(v) === i);
		});
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	$insert(data) {
		const db = this._db;

		db.push(padData(data));
		return Promise.resolve(data);
	}

	/**
	 * @param {Object} data
	 * @return {Promise(Object)}
	 */
	$update(data) {
		const db = this._db;

		db.forEach((row) => {
			if (row.z !== data.z) return;
			Object.assign(row, data);
		});

		return Promise.resolve(data);
	}

	/**
	 * @param {Array} zs
	 * @return {Promise(Number)}
	 */
	$removeuid(zs) {
		const db = this._db;
		zs = [].concat(zs || []);

		let list = db.map((row, i) => zs.indexOf(row.z) >= 0 ? i : -1)
			.filter(i => i >= 0);

		list.reverse()
			.forEach(i => db.splice(i, 1)[0]);

		return Promise.resolve(list.length);
	}

	/**
	 * @param {number} t
	 * @return {Promise(Number)}
	 */
	$removeall(t) {
		const db = this._db;

		let list = db.map((row, i) => row.t < t ? i : -1)
			.filter(i => i >= 0);

		list.reverse()
			.forEach(i => db.splice(i, 1)[0]);

		return Promise.resolve(list.length);
	}

	/**
	 * @param {string} name
	 * @param {number} t
	 * @param {number} e
	 * @return {Promise(Number)}
	 */
	$remove(name, t, e) {
		const db = this._db;

		let list = db.map((row, i) => {
			if (!(row instanceof Object)) return i;
			if (e && row.e && row.e <= e) return -1;
			if (t && row.t >= t) return -1;
			if (name === row.k || row.k.startsWith(`${name}.`)) return i;
		}).filter(i => i >= 0);

		list.reverse()
			.forEach(i => db.splice(i, 1)[0]);

		return Promise.resolve(list.length);
	}
}

class VaultUse {
	constructor(db, key) {
		this._db = db;
		this._usekey = key;
	}

	on(name, cb) {
		return this._db.on(`${this._usekey}.${name}`, cb);
	}

	once(name, cb) {
		return this._db.once(`${this._usekey}.${name}`, cb);
	}

	off(name, cb) {
		return this._db.off(`${this._usekey}.${name}`, cb);
	}

	emit(name, data, t) {
		return this._db.emit(`${this._usekey}.${name}`, data, t);
	}

	trigger(name) {
		return this._db.trigger(`${this._usekey}.${name}`);
	}

	get(name) {
		return this._db.get(`${this._usekey}.${name}`);
	}

	set(name, data, expire) {
		return this._db.set(`${this._usekey}.${name}`, data, expire);
	}

	del(name, t, e) {
		return this._db.del(`${this._usekey}.${name}`, t, e);
	}

	express() {
		let args = [].slice.call(arguments);
		return this._db.express.apply(this, args);
	}

	socketio() {
		let args = [].slice.call(arguments);
		return this._db.socketio.apply(this, args);
	}

	relay() {
		let args = [].slice.call(arguments);
		return this._db.relay.apply(this, args);
	}
}

VaultDb.emitWait = 10;
VaultDb.expireWait = 100;

module.exports = VaultDb;
module.exports.newUid = newUid;
module.exports.uidToTime = uidToTime;
module.exports.listBackups = listBackups;
module.exports.getBody = getBody;

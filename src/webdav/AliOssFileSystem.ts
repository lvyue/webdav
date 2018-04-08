import AliOssSerializer from './AliOssSerializer';
import { Readable, Writable, Transform, Duplex } from 'stream';
import { v2 as webdav } from 'webdav-server';
import { Wrapper as OSS } from 'ali-oss';
import DEBUG from 'debug';
import { XMLElement } from 'xml-js-builder';
import * as async from 'async';
import { file } from 'babel-types';
import AliOssResource from './AliOssResource';

const debug = DEBUG('oss');
export interface Options {
    [prop: string]: any;
}

export interface AliOssListOptions extends Options {
    prefix?: string;
    delimiter?: string;
    marker?: string;
    maxKeys?: number;
}
export interface AliOssResultData extends Options {
    statusCode?: number;
    objects?: AliOssObject[];
    prefixes: string[];
    nextMarker: string;

    stream?: Readable;
}
export interface AliOssObject extends Options {
    name: string;
    url: string;
    size: number;
    type: string;
    etag: string;
    lastModified: string;
    storageClass: string;
}

export default class AliOssFileSystem extends webdav.FileSystem implements Options {
    resources: {
        [path: string]: AliOssResource;
    } = {};
    client: OSS;

    constructor(public region: string, public bucket: string, public accessKeyId: string, public accessKeySecret: string) {
        super(new AliOssSerializer());
        this.client = new OSS({ region, bucket, accessKeyId, accessKeySecret });
        this.resources = { '/': new AliOssResource() };
    }

    protected _create?(path: webdav.Path, ctx: webdav.CreateInfo, callback: webdav.SimpleCallback): void {
        if (path.isRoot()) return callback(webdav.Errors.InvalidOperation);
        let url = path.toString(),
            dir;
        url = url.startsWith('/') ? url.slice(1) : url;
        if (ctx.type.isDirectory) {
            // dir
            dir = url + (url.endsWith('/') ? '' : '/');
            this.client.put(dir, Buffer.alloc(0)).then(() => callback()).catch(callback);
        } else {
            // file
            debug('Create:', path);
            callback();
        }
    }

    protected _delete(path: webdav.Path, ctx: webdav.DeleteInfo, callback: webdav.SimpleCallback): void {
        debug('_delete:', path.toString());
        if (path.isRoot()) return callback(webdav.Errors.InvalidOperation);
        let url = path.toString();
        url = url.startsWith('/') ? url.slice(1) : url;
        this._list({ prefix: url }, [], (err, data) => {
            if (err) return callback(err);
            if (data.length === 0) return callback();
            const dir = url + (url.endsWith('/') ? '' : '/');
            const f = data.filter(r => r.path === url || r.path.startsWith(dir));
            if (f.length == 0) return callback(webdav.Errors.ResourceNotFound);
            this.client
                .deleteMulti(f.map(r => r.path), { quiet: true })
                .then(() => {
                    f.forEach(a => {
                        let dir = '/' + a.path;
                        dir = dir.endsWith('/') ? dir.substr(0, dir.length - 1) : dir;
                        delete this.resources[dir];
                    });
                    callback();
                })
                .catch(callback);
        });
    }

    protected _get(path: webdav.Path, callback: webdav.ReturnCallback<AliOssResource>): void {
        let url = path.toString();
        const r = this.resources[url];
        if (r) return callback(undefined, r);
        url = url.startsWith('/') ? url.slice(1) : url;
        this._list(
            {
                prefix: url,
                delimiter: '/'
            },
            [],
            (err, resources) => {
                if (err) return callback(webdav.Errors.ResourceNotFound);
                const dir = url + (url.endsWith('/') ? '' : '/');
                const f = resources.filter(r => r.path === url || r.path === dir);
                if (f.length === 1) {
                    this.resources[path.toString()] = f[0];
                    // 只有一个
                    return callback(undefined, f[0]);
                } else {
                    callback(webdav.Errors.ResourceNotFound);
                }
            }
        );
    }
    protected _list(options: AliOssListOptions, data: AliOssResource[], callback: webdav.ReturnCallback<AliOssResource[]>): void {
        const opts: Options = {};
        for (const p in options) {
            opts[p] = options[p];
        }
        delete opts.maxKeys;
        if (options.maxKeys) {
            opts['max-keys'] = options.maxKeys;
        }
        this.client
            .list(opts)
            .then((res: AliOssResultData) => {
                let e;
                if (res.statusCode === 404) e = webdav.Errors.ResourceNotFound;
                data = data.concat(
                    res.objects && res.objects.length > 0
                        ? res.objects.map(obj => ({
                              name: obj.name.split('/').splice(-2).join(''),
                              path: obj.name,
                              size: obj.size,
                              url: obj.url,
                              etag: obj.etag,
                              lastModified: obj.lastModified,
                              storageClass: obj.storageClass,
                              storageType: obj.type,
                              type: obj.name.endsWith('/') ? webdav.ResourceType.Directory : webdav.ResourceType.File,
                              props: new webdav.LocalPropertyManager(),
                              locks: new webdav.LocalLockManager()
                          }))
                        : [],
                    res.prefixes && res.prefixes.length > 0
                        ? res.prefixes.map(
                              obj =>
                                  ({
                                      name: obj.split('/').splice(-2).join(''),
                                      path: obj,
                                      size: 0,
                                      type: webdav.ResourceType.Directory,
                                      props: new webdav.LocalPropertyManager(),
                                      locks: new webdav.LocalLockManager()
                                  } as AliOssResource)
                          )
                        : []
                );
                if (res.nextMarker) {
                    // 继续搜索
                    options.marker = res.nextMarker;
                    this._list(options, data, callback);
                } else {
                    callback(e, data);
                }
            })
            .catch(callback);
    }
    protected _openReadStream(path: webdav.Path, ctx: webdav.OpenReadStreamInfo, callback: webdav.ReturnCallback<Readable>): void {
        if (path.isRoot()) return callback(webdav.Errors.InvalidOperation);
        let oKey = path.toString();
        oKey = oKey.startsWith('/') ? oKey.slice(1) : oKey;
        this.client
            .getStream(oKey)
            .then((res: AliOssResultData) => {
                callback(undefined, res.stream);
            })
            .catch(callback);
    }

    protected _openWriteStream(path: webdav.Path, ctx: webdav.OpenWriteStreamInfo, callback: webdav.ReturnCallback<Writable>): void {
        if (path.isRoot()) return callback(webdav.Errors.InvalidOperation);
        const wStream = new Transform({
            transform(chunk, encoding, cb) {
                cb(undefined, chunk);
            }
        });
        let oKey = path.toString();
        oKey = oKey.startsWith('/') ? oKey.slice(1) : oKey;
        this.client.putStream(oKey, wStream).then(debug).catch((e: Error) => {
            wStream.emit('error', e);
        });
        callback(undefined, wStream);
    }

    protected _lockManager(path: webdav.Path, ctx: webdav.LockManagerInfo, callback: webdav.ReturnCallback<webdav.ILockManager>): void {
        debug('_lockManager', path);
        let resource = this.resources[path.toString()];
        if (resource) {
            return callback(undefined, resource.locks);
        }
        if (path.isRoot()) {
            resource = new AliOssResource();
            this.resources[path.toString()] = resource;
            return callback(undefined, resource.locks);
        }
        this._get(path, (err, data) => {
            if (err || !data) return callback(webdav.Errors.ResourceNotFound);
            this.resources[path.toString()] = data;
            return callback(undefined, data.locks);
        });
    }

    protected _propertyManager(path: webdav.Path, ctx: webdav.PropertyManagerInfo, callback: webdav.ReturnCallback<webdav.IPropertyManager>): void {
        debug('_propertyManager', path);
        let resource = this.resources[path.toString()];
        if (resource) {
            return callback(undefined, resource.props);
        }
        if (path.isRoot()) {
            resource = new AliOssResource();
            this.resources[path.toString()] = resource;
            return callback(undefined, resource.props);
        }
        this._get(path, (err, data) => {
            if (err || !data) return callback(webdav.Errors.ResourceNotFound);
            this.resources[path.toString()] = data;
            return callback(undefined, data.props);
        });
    }

    protected _readDir(path: webdav.Path, ctx: webdav.ReadDirInfo, callback: webdav.ReturnCallback<string[] | webdav.Path[]>): void {
        debug('_readDir', path.isRoot(), path);
        let url = path.toString(),
            dir;
        url = url.startsWith('/') ? url.slice(1) : url;
        if (!path.isRoot()) dir = url + (url.endsWith('/') ? '' : '/');
        this._list(
            {
                prefix: dir,
                marker: dir,
                delimiter: '/'
            },
            [],
            (err, resources) => {
                if (err) return callback(webdav.Errors.ResourceNotFound);
                debug('Path:', url, ',Resources:', resources);
                callback(undefined, resources.map(r => r.path));
            }
        );
    }

    protected _rename(path: webdav.Path, name: string, ctx: webdav.RenameInfo, callback: webdav.ReturnCallback<boolean>): void {
        if (path.isRoot()) return callback(webdav.Errors.InvalidOperation);
        this._type(path, { context: ctx.context }, (err, type) => {
            if (err) return callback(err);
            if (!type) return callback(webdav.Errors.ResourceNotFound);
            let from = path.toString(),
                to = path.paths.slice(0, -1).join('/');
            from = from.startsWith('/') ? from.slice(1) : from;
            to = to + (to.endsWith('/') ? '' : '/') + name;
            if (type.isDirectory) {
                from += from.endsWith('/') ? '' : '/';
                to += to.endsWith('/') ? '' : '/';
                this._list({ prefix: from }, [], (err, objs) => {
                    if (err) return callback(err);
                    const actions = objs.map(o => ({ from: o.path, to: to + o.path.slice(from.length) }));
                    async.eachLimit(
                        actions,
                        10,
                        (action, done) => {
                            this.client
                                .copy(action.to, action.from)
                                .then(() => {
                                    done();
                                })
                                .catch(done);
                        },
                        err => {
                            if (err) return callback(webdav.Errors.InvalidOperation);
                            this.client
                                .deleteMulti(actions.map(a => a.from), { quiet: true })
                                .then(() => {
                                    actions.forEach(a => {
                                        let dir = '/' + a.from;
                                        dir = dir.endsWith('/') ? dir.substr(0, dir.length - 1) : dir;
                                        delete this.resources[dir];
                                    });
                                    callback();
                                })
                                .catch(callback);
                        }
                    );
                });
            } else {
                // 文件复制
                this.client
                    .copy(to, from)
                    .then(() => {
                        this._delete(path, { context: ctx.context, depth: -1 }, callback);
                    })
                    .catch(callback);
            }
        });
    }

    protected _fastExistCheck?(ctx: webdav.RequestContext, path: webdav.Path, callback: (exists: boolean) => void): void {
        debug('_fastExistCheck:', path.toString());
        if (path.isRoot()) return callback(true);
        const resource = this.resources[path.toString()];
        if (resource) return callback(true);
        this._get(path, (e, r) => {
            if (e) return callback(false);
            if (r) return callback(true);
            return callback(false);
        });
    }

    protected _move(from: webdav.Path, to: webdav.Path, ctx: webdav.MoveInfo, callback: webdav.SimpleCallback): void {
        debug('_move:from:', from.toString(), ',to:', to.toString());
        if (from.isRoot()) return callback(webdav.Errors.InvalidOperation);
        const fName = from.paths.slice(-1).join(''),
            tName = to.paths.slice(-1).join('');
        if (fName !== tName && from.paths.slice(0, -1).join('/') === to.paths.slice(1, -1).join('/')) {
            // 重命名
            return this._rename(from, tName, { context: ctx.context, destinationPath: to }, callback);
        } else {
            // 移动
            this._type(from, { context: ctx.context }, (err, type) => {
                if (err) return callback(err);
                if (!type) return callback(webdav.Errors.ResourceNotFound);
                let srcPath = from.toString(),
                    destPath = to.paths.slice(1).join('/');
                srcPath = srcPath.startsWith('/') ? srcPath.slice(1) : srcPath;
                destPath = destPath.startsWith('/') ? destPath.slice(1) : destPath;
                if (type.isDirectory) {
                    srcPath += srcPath.endsWith('/') ? '' : '/';
                    destPath += destPath.endsWith('/') ? '' : '/';
                    this._list({ prefix: srcPath }, [], (err, objs) => {
                        if (err) return callback(err);
                        const actions = objs.map(o => ({ from: o.path, to: destPath + o.path.slice(srcPath.length) }));
                        async.eachLimit(
                            actions,
                            10,
                            (action, done) => {
                                this.client
                                    .copy(action.to, action.from)
                                    .then(() => {
                                        done();
                                    })
                                    .catch(done);
                            },
                            err => {
                                if (err) return callback(webdav.Errors.InvalidOperation);
                                this.client
                                    .deleteMulti(actions.map(a => a.from), { quiet: true })
                                    .then(() => {
                                        actions.forEach(a => {
                                            let dir = '/' + a.from;
                                            dir = dir.endsWith('/') ? dir.substr(0, dir.length - 1) : dir;
                                            delete this.resources[dir];
                                        });
                                        callback();
                                    })
                                    .catch(callback);
                            }
                        );
                    });
                } else {
                    this.client
                        .copy(destPath, srcPath)
                        .then(() => {
                            this._delete(from, { context: ctx.context, depth: 1 }, callback);
                        })
                        .catch(callback);
                }
            });
        }
    }

    protected _copy(from: webdav.Path, to: webdav.Path, ctx: webdav.MoveInfo, callback: webdav.SimpleCallback): void {
        debug('_copy:from:', from.toString(), 'to', to.toString());
        if (from.isRoot()) return callback(webdav.Errors.InvalidOperation);
        const fName = from.paths.slice(-1).join(''),
            tName = to.paths.slice(-1).join('');
        if (fName !== tName && from.paths.slice(0, -1).join('/') === to.paths.slice(1, -1).join('/')) {
            // 重命名
            return this._rename(from, tName, { context: ctx.context, destinationPath: to }, callback);
        } else {
            // 移动
            this._type(from, { context: ctx.context }, (err, type) => {
                if (err) return callback(err);
                if (!type) return callback(webdav.Errors.ResourceNotFound);
                let srcPath = from.toString(),
                    destPath = to.paths.slice(1).join('/');
                srcPath = srcPath.startsWith('/') ? srcPath.slice(1) : srcPath;
                destPath = destPath.startsWith('/') ? destPath.slice(1) : destPath;
                if (type.isDirectory) {
                    srcPath += srcPath.endsWith('/') ? '' : '/';
                    destPath += destPath.endsWith('/') ? '' : '/';
                    this._list({ prefix: srcPath }, [], (err, objs) => {
                        if (err) return callback(err);
                        const actions = objs.map(o => ({ from: o.path, to: destPath + o.path.slice(srcPath.length) }));
                        async.eachLimit(
                            actions,
                            10,
                            (action, done) => {
                                this.client
                                    .copy(action.to, action.from)
                                    .then(() => {
                                        done();
                                    })
                                    .catch(done);
                            },
                            err => {
                                if (err) return callback(webdav.Errors.InvalidOperation);
                                callback();
                            }
                        );
                    });
                } else {
                    this.client
                        .copy(destPath, srcPath)
                        .then(() => {
                            callback();
                        })
                        .catch(callback);
                }
            });
        }
    }

    protected _size(path: webdav.Path, ctx: webdav.SizeInfo, callback: webdav.ReturnCallback<number>): void {
        debug('_size:', path.toString());
        if (path.isRoot()) return callback(undefined, undefined);
        this._get(path, (err, resource) => {
            if (
                err ||
                !resource // 未找到
            )
                return callback(err || webdav.Errors.ResourceNotFound);
            return callback(err, resource.type.isDirectory ? undefined : resource.size);
        });
    }

    protected _etag(path: webdav.Path, ctx: webdav.ETagInfo, callback: webdav.ReturnCallback<string>): void {
        debug('_etag:', path.toString());
        if (path.isRoot()) return callback(undefined, undefined);
        this._get(path, (err, resource) => {
            if (
                err ||
                !resource // 未找到
            )
                return callback(err || webdav.Errors.ResourceNotFound);
            return callback(err, resource.type.isDirectory ? undefined : resource.etag);
        });
    }

    protected _creationDate?(path: webdav.Path, ctx: webdav.CreationDateInfo, callback: webdav.ReturnCallback<number>): void {
        debug('_creationDate:', path.toString());
        if (path.isRoot()) return callback(undefined, Date.now());
        this._get(path, (err, resource) => {
            if (
                err ||
                !resource // 未找到
            )
                return callback(err || webdav.Errors.ResourceNotFound);
            return callback(err, resource.type.isDirectory ? Date.now() : new Date(resource.lastModified).getTime());
        });
    }

    protected _lastModifiedDate?(path: webdav.Path, ctx: webdav.LastModifiedDateInfo, callback: webdav.ReturnCallback<number>): void {
        debug('_lastModifiedDate:', path.toString());
        if (path.isRoot()) return callback(undefined, Date.now());
        this._get(path, (err, resource) => {
            if (
                err ||
                !resource // 未找到
            )
                return callback(err || webdav.Errors.ResourceNotFound);
            return callback(err, resource.type.isDirectory ? Date.now() : new Date(resource.lastModified).getTime());
        });
    }

    protected _displayName?(path: webdav.Path, ctx: webdav.DisplayNameInfo, callback: webdav.ReturnCallback<string>): void {
        debug('_displayName', path.toString());
        if (path.isRoot()) return callback(undefined, '/');
        this._get(path, (err, resource) => {
            if (err || !resource) return callback(err || webdav.Errors.ResourceNotFound);
            return callback(undefined, resource.name);
        });
    }
    protected _type(path: webdav.Path, ctx: webdav.TypeInfo, callback: webdav.ReturnCallback<webdav.ResourceType>): void {
        debug('_type', path.toString());
        if (path.isRoot()) return callback(undefined, webdav.ResourceType.Directory);
        this._get(path, (e, data) => {
            if (e) return callback(webdav.Errors.ResourceNotFound);
            callback(e, data ? data.type : undefined);
        });
    }
}

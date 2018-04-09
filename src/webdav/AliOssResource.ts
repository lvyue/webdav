import { v2 as webdav } from 'webdav-server';

export default class AliOssResource {
    name?: string;
    path?: string;
    size?: number;
    url?: string;
    downloadUrl?: string;
    lastModified?: number;
    creationDate?: number;
    etag?: string;
    storageClass?: string;
    storageType?: string;
    type?: webdav.ResourceType;
    props: webdav.LocalPropertyManager;
    locks: webdav.LocalLockManager;
    constructor(data?: AliOssResource) {
        if (!data) {
            this.props = new webdav.LocalPropertyManager();
            this.locks = new webdav.LocalLockManager();
            this.creationDate = Date.now();
            this.lastModified = Date.now();
        } else {
            const r = data as AliOssResource;
            this.props = r.props || new webdav.LocalPropertyManager();
            this.locks = r.locks || new webdav.LocalLockManager();
            this.type = r.type;
            this.creationDate = r.creationDate ? new Date(r.creationDate).getTime() : Date.now();
            this.lastModified = r.lastModified ? new Date(r.lastModified).getTime() : Date.now();
            this.name = r.name;
            this.path = r.path;
            this.size = r.size;
            this.url = r.url;
            this.downloadUrl = r.downloadUrl;
            this.etag = r.etag;
            this.storageClass = r.storageClass;
            this.storageType = r.storageType;
        }
    }
}

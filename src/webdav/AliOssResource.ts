import { v2 as webdav } from 'webdav-server';

export default class AliOssResource {
    name?: string;
    path?: string;
    size?: number;
    url?: string;
    downloadUrl?: string;
    lastModified?: string;
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
        } else {
            const r = data as AliOssResource;
            this.props = r.props || new webdav.LocalPropertyManager();
            this.locks = r.locks || new webdav.LocalLockManager();
            this.type = r.type;
            this.lastModified = r.lastModified;
            this.name = r.name;
            this.path = r.path;
            this.size = r.size;
            this.url = r.url;
            this.downloadUrl = r.downloadUrl;
            this.lastModified = r.lastModified;
            this.etag = r.etag;
            this.storageClass = r.storageClass;
            this.storageType = r.storageType;
        }
    }
}

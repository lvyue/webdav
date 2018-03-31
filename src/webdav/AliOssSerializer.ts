import AliOssFileSystem from './AliOssFileSystem';
import AliOssResource from './AliOssResource';
import { v2 as webdav } from 'webdav-server';

export interface AliOssSerializedData {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    resources: {
        [path: string]: AliOssResource;
    };
}

export default class AliOssSerializer implements webdav.FileSystemSerializer {
    uid(): string {
        return 'AliOssSerializer-1.0.0';
    }

    serialize(fs: AliOssFileSystem, callback: webdav.ReturnCallback<AliOssSerializedData>): void {
        callback(undefined, {
            region: fs.region,
            bucket: fs.bucket,
            accessKeyId: fs.accessKeyId,
            accessKeySecret: fs.accessKeySecret,
            resources: fs.resources
        });
    }

    unserialize(serializedData: AliOssSerializedData, callback: webdav.ReturnCallback<AliOssFileSystem>): void {
        const fs = new AliOssFileSystem(serializedData.region, serializedData.bucket, serializedData.accessKeyId, serializedData.accessKeySecret);

        for (const path in serializedData.resources) fs.resources[path] = new AliOssResource(serializedData.resources[path]);

        callback(undefined, fs);
    }
}

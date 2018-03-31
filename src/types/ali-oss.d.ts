// Add RequestValidation Interface on to Express's Request Interface.
import stream, { Stream } from 'stream';
declare namespace AliOss {

}
export interface WrapperOptions {}
export interface ListOptions {
    prefix?: string;
    delimiter?: string;
    marker?: string;
    maxKeys?: number;
}

export interface AliOssResultData {
    statusCode?: number;
    objects?: AliOssObject[];
    prefixes: string[];
    nextMarker: string;

    stream?: Stream;
}
export interface AliOssObject {
    name: string;
    url: string;
    size: number;
    type: string;
    etag: string;
    lastModified: string;
    storageClass: string;
}
export interface MetaOptions {
    meta?: {
        [name: string]: any;
    };
}

export interface StreamUploadOptions extends MetaOptions {
    contentLength?: number;
}

export interface MultiUploadOptions extends MetaOptions {
    checkpoint: Object;
    partSize: number;
    progress: (percentage: number, checkpoint: Object, res: {}) => void;
    headers: {};
}

export interface DeleteOptions {
    quiet?: boolean;
}
export class Wrapper {
    constructor(options: WrapperOptions);
    list(opt: ListOptions): Promise<AliOssResultData>;
    put(path: string, data: string | Buffer | File, meta?: MetaOptions): Promise<AliOssResultData>;
    putStream(path: string, stream: Stream, meta?: StreamUploadOptions): Promise<AliOssResultData>;
    multipartUpload(path: string, file: string | File, meta?: MultiUploadOptions): Promise<AliOssResultData>;
    /**
     *
     * 拷贝文件
     * 使用copy拷贝一个文件。拷贝可以发生在下面两种情况：
     *
     * 同一个Bucket
     * 两个不同Bucket，但是它们在同一个region，此时的源Object名字应为’/bucket/object’的形式
     * 另外，拷贝时对文件元信息的处理有两种选择：
     *
     * 如果没有指定meta参数，则与源文件相同，即拷贝源文件的元信息
     * 如果指定了meta参数，则使用新的元信息覆盖源文件的信息
     * @param target {string} 目标文件路径
     * @param source {string} 源文件路径
     * @param meta {MetaOptions} meta信息，可选
     */
    copy(target: string, source: string, meta?: MetaOptions): Promise<AliOssResultData>;
    delete(path: string): Promise<AliOssResultData>;
    putMeta(path: string, meta?: MetaOptions): Promise<AliOssResultData>;
    deleteMulti(paths: string[], options: DeleteOptions): Promise<AliOssResultData>;
    getStream(path: string): Promise<AliOssResultData>;
}

export default AliOss;

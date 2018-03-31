import { v2 as webdav } from 'webdav-server';
import AliOssFileSystem from './AliOssFileSystem';
import AliOssSerializer from './AliOssSerializer';
import Config from '../config';

const um = new webdav.SimpleUserManager();
const user = um.addUser('admin', 'admin', true);

const pm = new webdav.SimplePathPrivilegeManager();
export default new webdav.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(um, 'Basic'),
    privilegeManager: pm,
    autoLoad: {
        serializers: [new AliOssSerializer()]
    },
    rootFileSystem: new AliOssFileSystem(Config.oss.region, Config.oss.bucket, Config.oss.accessKeyId, Config.oss.accessKeySecret)
});

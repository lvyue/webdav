import express from 'express';
import compression from 'compression'; // compresses requests
import session from 'express-session';
import bodyParser from 'body-parser';
import logger from './util/logger';
import expressValidator from 'express-validator';
import bluebird from 'bluebird';
import morgan from 'morgan';
import { v2 as webdav } from 'webdav-server';
import Config from './config';
import webdavServer from './webdav/server';

// Controllers (route handlers)

// Create Express server
const app = express();

// Express configuration
app.use(morgan('dev'));
app.set('port', process.env.PORT || 3000);
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());

app.use('/', webdav.extensions.express(Config.dav.path, webdavServer));

export default app;

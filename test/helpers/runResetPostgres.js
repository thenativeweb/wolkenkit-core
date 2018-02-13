'use strict';

const { parse } = require('pg-connection-string'),
      pg = require('pg'),
      processenv = require('processenv');

const namespace = processenv('NAMESPACE'),
      url = processenv('URL');

(async () => {
  const pool = new pg.Pool(parse(url));
  const database = await pool.connect();

  try {
    await database.query(`TRUNCATE store_${namespace}_events, store_${namespace}_snapshots;`);
  } catch (ex) {
    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  } finally {
    database.release();
    await pool.end();
  }
})();

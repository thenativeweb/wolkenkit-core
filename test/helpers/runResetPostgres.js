'use strict';

const pg = require('pg'),
      processenv = require('processenv');

const namespace = processenv('NAMESPACE'),
      url = processenv('URL');

/* eslint-disable callback-return, no-process-exit */
pg.connect(url, (errConnect, db, done) => {
  if (errConnect) {
    done();
    process.exit(1);
  }

  db.query(`TRUNCATE store_${namespace}_events, store_${namespace}_snapshots;`, errQuery => {
    done();
    if (errQuery) {
      process.exit(1);
    }
    process.exit(0);
  });
});
/* eslint-enable callback-return, no-process-exit */

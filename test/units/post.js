'use strict';

const shell = require('shelljs');

const post = function (done) {
  (async () => {
    try {
      shell.exec([
        'docker kill rabbitmq-units; docker rm -v rabbitmq-units',
        'docker kill postgres-units; docker rm -v postgres-units'
      ].join(';'));
    } catch (ex) {
      return done(ex);
    }
    done();
  })();
};

module.exports = post;

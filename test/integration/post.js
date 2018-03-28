'use strict';

const shell = require('shelljs');

const post = function (done) {
  (async () => {
    try {
      shell.exec([
        'docker kill rabbitmq-integration; docker rm -v rabbitmq-integration',
        'docker kill postgres-integration; docker rm -v postgres-integration'
      ].join(';'));
    } catch (ex) {
      return done(ex);
    }
    done();
  })();
};

module.exports = post;

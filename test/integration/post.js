'use strict';

const processenv = require('processenv'),
      shell = require('shelljs');

const post = function (done) {
  if (processenv('CIRCLECI')) {
    // On CircleCI, we are not allowed to remove Docker containers.
    return done(null);
  }

  shell.exec([
    'docker kill rabbitmq-integration; docker rm -v rabbitmq-integration',
    'docker kill postgres-integration; docker rm -v postgres-integration'
  ].join(';'), done);
};

module.exports = post;

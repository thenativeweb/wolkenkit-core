'use strict';

const async = require('async'),
      shell = require('shelljs');

const env = require('../helpers/env'),
      waitForHost = require('../helpers/waitForHost');

const pre = function (done) {
  async.series({
    runRabbitMq (callback) {
      shell.exec('docker run -d -p 5673:5672 --name rabbitmq-units rabbitmq:3.6.6-alpine', callback);
    },
    runPostgres (callback) {
      shell.exec('docker run -d -p 5433:5432 -e POSTGRES_USER=wolkenkit -e POSTGRES_PASSWORD=wolkenkit -e POSTGRES_DB=wolkenkit --name postgres-units postgres:9.6.2-alpine', callback);
    },
    waitForRabbitMq (callback) {
      waitForHost(env.RABBITMQ_URL_UNITS, callback);
    },
    waitForPostgres (callback) {
      waitForHost(env.POSTGRES_URL_UNITS, callback);
    }
  }, done);
};

module.exports = pre;

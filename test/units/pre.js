'use strict';

const shell = require('shelljs');

const env = require('../helpers/env'),
      waitForPostgres = require('../helpers/waitForPostgres'),
      waitForRabbitMq = require('../helpers/waitForRabbitMq');

const pre = function (done) {
  (async () => {
    try {
      shell.exec('docker run -d -p 5673:5672 --name rabbitmq-units rabbitmq:3.6.6-alpine');
      shell.exec('docker run -d -p 5433:5432 -e POSTGRES_USER=wolkenkit -e POSTGRES_PASSWORD=wolkenkit -e POSTGRES_DB=wolkenkit --name postgres-units postgres:9.6.4-alpine');
      await waitForRabbitMq({ url: env.RABBITMQ_URL_UNITS });
      await waitForPostgres({ url: env.POSTGRES_URL_UNITS });
    } catch (ex) {
      return done(ex);
    }
    done();
  })();
};

module.exports = pre;

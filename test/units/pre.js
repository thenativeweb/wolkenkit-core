'use strict';

const oneLine = require('common-tags/lib/oneLine'),
      shell = require('shelljs');

const env = require('../shared/env'),
      waitForPostgres = require('../shared/waitForPostgres'),
      waitForRabbitMq = require('../shared/waitForRabbitMq');

const pre = async function () {
  shell.exec(oneLine`
    docker run
      -d
      -p 5673:5672
      -e RABBITMQ_DEFAULT_USER=wolkenkit
      -e RABBITMQ_DEFAULT_PASS=wolkenkit
      --name rabbitmq-units
      thenativeweb/wolkenkit-rabbitmq:latest
  `);
  shell.exec(oneLine`
    docker run
      -d
      -p 5433:5432
      -e POSTGRES_DB=wolkenkit
      -e POSTGRES_USER=wolkenkit
      -e POSTGRES_PASSWORD=wolkenkit
      --name postgres-units
      thenativeweb/wolkenkit-postgres:latest
  `);

  await waitForRabbitMq({ url: env.RABBITMQ_URL_UNITS });
  await waitForPostgres({ url: env.POSTGRES_URL_UNITS });
};

module.exports = pre;

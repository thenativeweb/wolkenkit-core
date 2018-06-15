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
      -p 5674:5672
      -e RABBITMQ_DEFAULT_USER=wolkenkit
      -e RABBITMQ_DEFAULT_PASS=wolkenkit
      --name rabbitmq-integration
      thenativeweb/wolkenkit-rabbitmq:latest
  `);
  shell.exec(oneLine`
    docker run
      -d
      -p 5434:5432
      -e POSTGRES_DB=wolkenkit
      -e POSTGRES_USER=wolkenkit
      -e POSTGRES_PASSWORD=wolkenkit
      --name postgres-integration
      thenativeweb/wolkenkit-postgres:latest
  `);

  await waitForRabbitMq({ url: env.RABBITMQ_URL_INTEGRATION });
  await waitForPostgres({ url: env.POSTGRES_URL_INTEGRATION });
};

module.exports = pre;

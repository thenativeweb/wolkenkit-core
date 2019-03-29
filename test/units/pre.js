'use strict';

const oneLine = require('common-tags/lib/oneLine'),
      shell = require('shelljs');

const env = require('../shared/env'),
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

  await waitForRabbitMq({ url: env.RABBITMQ_URL_UNITS });
};

module.exports = pre;

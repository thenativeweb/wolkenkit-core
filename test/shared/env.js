'use strict';

/* eslint-disable no-process-env */
const env = {
  POSTGRES_URL_UNITS: process.env.POSTGRES_URL_UNITS || 'pg://wolkenkit:wolkenkit@local.wolkenkit.io:5433/wolkenkit',
  POSTGRES_URL_INTEGRATION: process.env.POSTGRES_URL_INTEGRATION || 'pg://wolkenkit:wolkenkit@local.wolkenkit.io:5434/wolkenkit',
  RABBITMQ_URL_UNITS: process.env.RABBITMQ_URL_UNITS || 'amqp://local.wolkenkit.io:5673',
  RABBITMQ_URL_INTEGRATION: process.env.RABBITMQ_URL_INTEGRATION || 'amqp://local.wolkenkit.io:5674'
};
/* eslint-enable no-process-env */

module.exports = env;

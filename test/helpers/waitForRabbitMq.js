'use strict';

const amqp = require('amqplib/callback_api'),
      retry = require('retry');

const waitForRabbitMq = function (options, callback) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.url) {
    throw new Error('Url is missing.');
  }

  const { url } = options;

  const operation = retry.operation();

  operation.attempt(() => {
    amqp.connect(url, {}, (err, connection) => {
      if (operation.retry(err)) {
        return;
      }

      if (err) {
        return callback(operation.mainError());
      }

      connection.close(errClose => {
        if (errClose) {
          return callback(errClose);
        }

        callback(null);
      });
    });
  });
};

module.exports = waitForRabbitMq;

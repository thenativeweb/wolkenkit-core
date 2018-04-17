'use strict';

const shell = require('shelljs');

const post = async function () {
  shell.exec([
    'docker kill rabbitmq-integration; docker rm -v rabbitmq-integration',
    'docker kill postgres-integration; docker rm -v postgres-integration'
  ].join(';'));
};

module.exports = post;

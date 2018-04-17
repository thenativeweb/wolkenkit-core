'use strict';

const shell = require('shelljs');

const post = async function () {
  shell.exec([
    'docker kill rabbitmq-units; docker rm -v rabbitmq-units',
    'docker kill postgres-units; docker rm -v postgres-units'
  ].join(';'));
};

module.exports = post;

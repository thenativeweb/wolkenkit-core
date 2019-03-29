'use strict';

const shell = require('shelljs');

const post = async function () {
  shell.exec([
    'docker kill rabbitmq-units; docker rm -v rabbitmq-units'
  ].join(';'));
};

module.exports = post;

'use strict';

const getApp = require('./getApp'),
      getLogger = require('./getLogger');

const get = function ({ app, command, repository, writeModel }) {
  if (!app) {
    throw new Error('App is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!repository) {
    throw new Error('Repository is missing.');
  }
  if (!writeModel) {
    throw new Error('Write model is missing.');
  }

  const services = {
    app: getApp({ repository, writeModel }),
    logger: getLogger({ app, command })
  };

  return services;
};

module.exports = get;

'use strict';

const getApp = require('./getApp'),
      getClient = require('./getClient'),
      getLogger = require('./getLogger');

const get = function ({ app, command, metadata, repository, writeModel }) {
  if (!app) {
    throw new Error('App is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!metadata) {
    throw new Error('Metadata are missing.');
  }
  if (!repository) {
    throw new Error('Repository is missing.');
  }
  if (!writeModel) {
    throw new Error('Write model is missing.');
  }

  const services = {
    app: getApp({ repository, writeModel }),
    client: getClient({ metadata }),
    logger: getLogger({ app, command })
  };

  return services;
};

module.exports = get;

'use strict';

const getApp = require('./getApp'),
      getLogger = require('./getLogger');

const get = function ({ app, command, repository, writeModel }) {
  const services = {
    app: getApp({ repository, writeModel }),
    logger: getLogger({ app, command })
  };

  return services;
};

module.exports = get;

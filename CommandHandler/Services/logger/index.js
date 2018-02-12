'use strict';

const stackTrace = require('stack-trace');

const logger = function ({ app }) {
  if (!app) {
    throw new Error('App is missing.');
  }

  return function () {
    const fileName = stackTrace.get()[2].getFileName();

    return app.services.getLogger(fileName);
  };
};

module.exports = logger;

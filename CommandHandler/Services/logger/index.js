'use strict';

const stackTrace = require('stack-trace');

const logger = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }

  return function () {
    const fileName = stackTrace.get()[2].getFileName();

    return options.app.services.getLogger(fileName);
  };
};

module.exports = logger;

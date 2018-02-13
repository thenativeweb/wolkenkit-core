'use strict';

const path = require('path');

const basePath = path.join('/', 'wolkenkit', 'app', 'server', 'writeModel');

const getLogger = function ({ app, command }) {
  if (!app) {
    throw new Error('App is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }

  const logger = app.services.getLogger(
    path.join(basePath, command.context.name, `${command.aggregate.name}.js`)
  );

  return logger;
};

module.exports = getLogger;

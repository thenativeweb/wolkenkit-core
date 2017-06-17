'use strict';

const errors = require('../errors');

const validateCommand = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
  }

  return function (callback) {
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    if (!options.writeModel[options.command.context.name]) {
      return callback(new errors.CommandFailed('Invalid context name.'));
    }
    if (!options.writeModel[options.command.context.name][options.command.aggregate.name]) {
      return callback(new errors.CommandFailed('Invalid aggregate name.'));
    }
    callback(null);
  };
};

module.exports = validateCommand;

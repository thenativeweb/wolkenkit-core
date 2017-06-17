'use strict';

const handleCommand = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }
  if (!options.commandHandler) {
    throw new Error('Command handler is missing.');
  }

  return function (aggregate, callback) {
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    options.commandHandler.handle({
      command: options.command,
      aggregate
    }, err => {
      if (err) {
        return callback(err);
      }
      callback(null, aggregate);
    });
  };
};

module.exports = handleCommand;

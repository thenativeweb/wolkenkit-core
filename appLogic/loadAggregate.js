'use strict';

const loadAggregate = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }
  if (!options.repository) {
    throw new Error('Repository is missing.');
  }

  return function (callback) {
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    options.repository.loadAggregateFor(options.command, (err, aggregate) => {
      if (err) {
        return callback(err);
      }

      callback(null, aggregate);
    });
  };
};

module.exports = loadAggregate;

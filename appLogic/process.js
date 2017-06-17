'use strict';

const async = require('async');

const errors = require('../errors');

const process = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }
  if (!options.steps) {
    throw new Error('Steps are missing.');
  }

  return function (aggregate, callback) {
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    async.series(options.steps.map(step => step({
      command: options.command,
      aggregate
    })), err => {
      if (err) {
        return callback(new errors.CommandRejected(err.message));
      }
      callback(null, aggregate);
    });
  };
};

module.exports = process;

'use strict';

const errors = require('../../errors');

const isAuthenticated = function (options) {
  return options.command.user.id !== 'anonymous';
};

const isGrantedForPublic = function (options) {
  return options.aggregate.api.forReadOnly.state.isAuthorized.commands[options.command.name].forPublic;
};

const isAccessGrantedToCommand = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }

  return function (callback) {
    if (isAuthenticated(options)) {
      return callback(null);
    }
    if (isGrantedForPublic(options)) {
      return callback(null);
    }
    callback(new errors.CommandRejected('Access denied.'));
  };
};

module.exports = isAccessGrantedToCommand;

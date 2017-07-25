'use strict';

const errors = require('../../errors');

const isOwner = function (options) {
  return options.command.user.id === options.aggregate.api.forReadOnly.state.isAuthorized.owner;
};

const isAuthenticated = function (options) {
  return options.command.user.id !== 'anonymous';
};

const isGrantedForAuthenticated = function (options) {
  return options.aggregate.api.forReadOnly.state.isAuthorized.commands[options.command.name].forAuthenticated;
};

const isGrantedForPublic = function (options) {
  return options.aggregate.api.forReadOnly.state.isAuthorized.commands[options.command.name].forPublic;
};

const isAccessGrantedToAggregate = function (options) {
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
    if (isOwner(options)) {
      return callback(null);
    }
    if (isGrantedForAuthenticated(options) && isAuthenticated(options)) {
      return callback(null);
    }
    if (isGrantedForPublic(options)) {
      return callback(null);
    }
    callback(new errors.CommandRejected('Access denied.'));
  };
};

module.exports = isAccessGrantedToAggregate;

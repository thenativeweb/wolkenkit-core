'use strict';

const errors = require('../errors');

const impersonateCommand = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }

  return function (callback) {
    if (!callback) {
      throw new Error('Callback is missing.');
    }
    if (!options.command.custom.asUser) {
      return callback(null);
    }
    if (!options.command.user.token['can-impersonate']) {
      return callback(new errors.CommandRejected('Impersonation denied.'));
    }

    options.command.addToken({ sub: options.command.custom.asUser });
    Reflect.deleteProperty(options.command.custom, 'asUser');
    callback(null);
  };
};

module.exports = impersonateCommand;

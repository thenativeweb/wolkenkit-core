'use strict';

const errors = require('../errors');

const impersonateCommand = async function ({ command }) {
  if (!command) {
    throw new Error('Command is missing.');
  }

  if (!command.custom.asUser) {
    return command;
  }
  if (!command.user.token['can-impersonate']) {
    throw new errors.CommandRejected('Impersonation denied.');
  }

  command.addToken({ sub: command.custom.asUser });

  Reflect.deleteProperty(command.custom, 'asUser');

  return command;
};

module.exports = impersonateCommand;

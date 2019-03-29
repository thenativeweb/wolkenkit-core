'use strict';

const errors = require('../errors');

const impersonateCommand = async function ({ command }) {
  if (!command) {
    throw new Error('Command is missing.');
  }

  if (!command.custom.asInitiator) {
    return command;
  }
  if (!command.initiator.token['can-impersonate']) {
    throw new errors.CommandRejected('Impersonation denied.');
  }

  command.addInitiator({ token: { sub: command.custom.asInitiator }});

  Reflect.deleteProperty(command.custom, 'asInitiator');

  return command;
};

module.exports = impersonateCommand;

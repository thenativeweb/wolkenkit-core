'use strict';

const errors = require('../../errors');

const isAuthenticated = function ({ command }) {
  return command.user.id !== 'anonymous';
};

const isGrantedForPublic = function ({ aggregate, command }) {
  return aggregate.api.forReadOnly.state.isAuthorized.commands[command.name].forPublic;
};

const isAccessGrantedToCommand = async function ({ aggregate, command }) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }

  if (isAuthenticated({ command })) {
    return;
  }
  if (isGrantedForPublic({ aggregate, command })) {
    return;
  }

  throw new errors.CommandRejected('Access denied.');
};

module.exports = isAccessGrantedToCommand;

'use strict';

const errors = require('../../errors');

const isOwner = function ({ aggregate, command }) {
  return command.user.id === aggregate.api.forReadOnly.state.isAuthorized.owner;
};

const isAuthenticated = function ({ command }) {
  return command.user.id !== 'anonymous';
};

const isGrantedForAuthenticated = function ({ aggregate, command }) {
  return aggregate.api.forReadOnly.state.isAuthorized.commands[command.name].forAuthenticated;
};

const isGrantedForPublic = function ({ aggregate, command }) {
  return aggregate.api.forReadOnly.state.isAuthorized.commands[command.name].forPublic;
};

const isAccessGrantedToAggregate = async function ({ aggregate, command }) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }

  if (isOwner({ aggregate, command })) {
    return;
  }
  if (isGrantedForAuthenticated({ aggregate, command }) && isAuthenticated({ command })) {
    return;
  }
  if (isGrantedForPublic({ aggregate, command })) {
    return;
  }

  throw new errors.CommandRejected('Access denied.');
};

module.exports = isAccessGrantedToAggregate;

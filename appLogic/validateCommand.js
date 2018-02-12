'use strict';

const errors = require('../errors');

const validateCommand = async function ({ command, writeModel }) {
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!writeModel) {
    throw new Error('Write model is missing.');
  }

  if (!writeModel[command.context.name]) {
    throw new errors.CommandFailed('Invalid context name.');
  }
  if (!writeModel[command.context.name][command.aggregate.name]) {
    throw new errors.CommandFailed('Invalid aggregate name.');
  }
};

module.exports = validateCommand;

'use strict';

const Value = require('validate-value');

const errors = require('../errors'),
      getServices = require('./services/get');

class CommandHandler {
  constructor ({ app, writeModel, repository }) {
    if (!app) {
      throw new Error('App is missing.');
    }
    if (!writeModel) {
      throw new Error('Write model is missing.');
    }
    if (!repository) {
      throw new Error('Repository is missing.');
    }

    this.app = app;
    this.writeModel = writeModel;
    this.repository = repository;

    this.logger = app.services.getLogger();
  }

  async validateCommand ({ command }) {
    if (!command) {
      throw new Error('Command is missing.');
    }

    const { writeModel } = this;

    const context = writeModel[command.context.name];

    if (!context) {
      throw new errors.CommandFailed('Invalid context name.');
    }

    const aggregateDefinition = context[command.aggregate.name];

    if (!aggregateDefinition) {
      throw new errors.CommandFailed('Invalid aggregate name.');
    }

    if (!aggregateDefinition.commands || !aggregateDefinition.commands[command.name]) {
      throw new errors.CommandFailed('Invalid command name.');
    }

    const { schema } = aggregateDefinition.commands[command.name];

    if (!schema) {
      return;
    }

    const value = new Value(schema);

    try {
      value.validate(command.data, { valueName: 'command.data' });
    } catch (ex) {
      throw new errors.CommandFailed(ex.message);
    }
  }

  async validateAuthorization ({ command, metadata, aggregate }) {
    if (!command) {
      throw new Error('Command is missing.');
    }
    if (!metadata) {
      throw new Error('Metadata are missing.');
    }
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }

    const { app, writeModel, repository } = this;
    const services = getServices({ app, command, metadata, repository, writeModel });

    const { isAuthorized } = writeModel[command.context.name][command.aggregate.name].commands[command.name];

    let isAuthorizationValid;

    try {
      isAuthorizationValid = await isAuthorized(aggregate.api.forReadOnly, command, services);
    } catch (ex) {
      throw new errors.CommandRejected('Access denied.');
    }

    if (isAuthorizationValid) {
      return;
    }

    throw new errors.CommandRejected('Access denied.');
  }

  async handle ({ command, metadata, aggregate }) {
    if (!command) {
      throw new Error('Command is missing.');
    }
    if (!metadata) {
      throw new Error('Metadata are missing.');
    }
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }

    command.reject = function (reason) {
      throw new errors.CommandRejected(reason);
    };

    const { app, writeModel, repository } = this;
    const services = getServices({ app, command, metadata, repository, writeModel });

    const commandHandler = aggregate.definition.commands[command.name].handle;

    try {
      await commandHandler(aggregate.api.forCommands, command, services);
    } catch (ex) {
      if (ex.code === 'ECOMMANDREJECTED') {
        throw ex;
      }

      this.logger.debug('Failed to handle command.', { err: ex });
      throw new errors.CommandFailed('Failed to handle command.', ex);
    }
  }
}

module.exports = CommandHandler;

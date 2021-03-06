'use strict';

const flatten = require('lodash/flatten');

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

  async handle ({ command, aggregate }) {
    if (!command) {
      throw new Error('Command is missing.');
    }
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }

    const commandHandlers = flatten([ aggregate.definition.commands[command.name] ]);

    command.reject = function (reason) {
      throw new errors.CommandRejected(reason);
    };

    const { app, writeModel, repository } = this;
    const services = getServices({ app, command, repository, writeModel });

    for (let i = 0; i < commandHandlers.length; i++) {
      const commandHandler = commandHandlers[i];

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
}

module.exports = CommandHandler;

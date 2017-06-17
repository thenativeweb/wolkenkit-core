'use strict';

const _ = require('lodash'),
      async = require('async');

const errors = require('../errors'),
      Services = require('./Services');

const CommandHandler = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.app) {
    throw new Error('App is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
  }
  if (!options.repository) {
    throw new Error('Repository is missing.');
  }

  this.writeModel = options.writeModel;
  this.services = new Services({
    app: options.app,
    writeModel: options.writeModel,
    repository: options.repository
  });

  this.logger = options.app.services.getLogger();
};

CommandHandler.prototype.handle = function (options, callback) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }
  if (!options.aggregate) {
    throw new Error('Aggregate is missing.');
  }

  const { aggregate, command } = options;

  const commandHandlers = _.flatten([ aggregate.definition.commands[command.name] ]);

  async.series(commandHandlers.map((commandHandler, index) =>
    doneCommandHandler => {
      const isFinalCommandHandler = index === (commandHandlers.length - 1);

      const mark = {
        asRejected (reason) {
          process.nextTick(() => doneCommandHandler(new errors.CommandRejected(reason)));
        },
        asDone () {
          process.nextTick(() => doneCommandHandler());
        }
      };

      if (!isFinalCommandHandler) {
        mark.asReadyForNext = mark.asDone;
        Reflect.deleteProperty(mark, 'asDone');
      }

      try {
        if (commandHandler.length === 4) {
          commandHandler(aggregate.api.forCommands, command, this.services, mark);
        } else {
          commandHandler(aggregate.api.forCommands, command, mark);
        }
      } catch (ex) {
        this.logger.debug('Failed to handle command.', { err: ex });
        process.nextTick(() => {
          doneCommandHandler(new errors.CommandFailed('Failed to handle command.', ex));
        });
      }
    }
  ), err => {
    if (err) {
      return callback(err);
    }
    callback(null);
  });
};

module.exports = CommandHandler;

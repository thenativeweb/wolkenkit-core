'use strict';

const async = require('async'),
      requireDir = require('require-dir');

const CommandHandler = require('../CommandHandler'),
      postProcess = require('./postProcess'),
      preProcess = require('./preProcess'),
      repository = require('../repository');

const workflow = requireDir();
const steps = { preProcess, postProcess };

const appLogic = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.app) {
    throw new Error('App is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
  }
  if (!options.eventStore) {
    throw new Error('Event store is missing.');
  }

  const app = options.app,
        eventStore = options.eventStore,
        writeModel = options.writeModel;

  const logger = app.services.getLogger();

  const commandHandler = new CommandHandler({ app, writeModel, repository });

  const publishEvents = workflow.publishEvents({
    eventbus: app.eventbus,
    flowbus: app.flowbus,
    eventStore
  });

  [
    { connection: app.commandbus.incoming, description: 'command bus' },
    { connection: app.eventbus.outgoing, description: 'event bus' },
    { connection: app.flowbus.outgoing, description: 'flow bus' },
    { connection: eventStore, description: 'event store' }
  ].forEach(wire => {
    wire.connection.on('error', err => {
      app.fail(err);
    });
    wire.connection.on('disconnect', () => {
      app.fail(new Error(`Lost connection to ${wire.description}.`));
    });
  });

  app.commandbus.incoming.on('data', command => {
    logger.info('Received command.', command);

    async.waterfall([
      workflow.validateCommand({ writeModel, command }),
      workflow.impersonateCommand({ command }),
      workflow.loadAggregate({ repository, command }),

      workflow.process({ command, steps: steps.preProcess }),
      workflow.handleCommand({ commandHandler, command }),
      workflow.process({ command, steps: steps.postProcess }),

      workflow.saveAggregate({ repository })
    ], (errWaterfall, aggregate, committedEvents) => {
      if (errWaterfall) {
        logger.error('Failed to handle command.', { command, errWaterfall });

        command.discard();

        let errorEventName = `${command.name}Failed`;

        if (errWaterfall.name === 'CommandRejected') {
          errorEventName = `${command.name}Rejected`;
        }

        const errorEvent = new app.Event({
          context: command.context,
          aggregate: command.aggregate,
          name: errorEventName,
          data: {
            reason: errWaterfall.cause ? errWaterfall.cause.message : errWaterfall.message
          },
          metadata: {
            correlationId: command.metadata.correlationId,
            causationId: command.id
          }
        });

        errorEvent.addUser(command.user);

        app.eventbus.outgoing.write(errorEvent);
        app.flowbus.outgoing.write(errorEvent);

        return;
      }

      logger.info('Handled command.', command);

      publishEvents(aggregate.instance.id, committedEvents, errPublishEvents => {
        command.next();
        if (errPublishEvents) {
          app.fail(errPublishEvents);
        }
      });
    });
  });
};

module.exports = appLogic;

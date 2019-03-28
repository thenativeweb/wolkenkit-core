'use strict';

const Course = require('marble-run');

const CommandHandler = require('../CommandHandler'),
      impersonateCommand = require('./impersonateCommand'),
      publishEvents = require('./publishEvents'),
      repository = require('../repository');

const appLogic = function ({ app, writeModel, eventStore, commandBusConcurrency }) {
  if (!app) {
    throw new Error('App is missing.');
  }
  if (!writeModel) {
    throw new Error('Write model is missing.');
  }
  if (!eventStore) {
    throw new Error('Event store is missing.');
  }
  if (!commandBusConcurrency) {
    throw new Error('Command bus concurrency is missing.');
  }

  const logger = app.services.getLogger();

  const course = new Course({
    trackCount: commandBusConcurrency
  });

  const commandHandler = new CommandHandler({ app, writeModel, repository });

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

  app.commandbus.incoming.on('data', async command => {
    logger.info('Received command.', command);

    let aggregate,
        committedEvents;

    try {
      await course.add({
        id: command.id,
        routingKey: command.aggregate.id,
        async task () {
          await commandHandler.validateCommand({ command });

          command = await impersonateCommand({ command });

          aggregate = await repository.loadAggregateFor(command);

          await commandHandler.validateAuthorization({ command, aggregate });
          await commandHandler.handle({ command, aggregate });

          committedEvents = await repository.saveAggregate(aggregate);
        }
      });
    } catch (ex) {
      logger.error('Failed to handle command.', { command, ex });

      command.discard();

      const errorEventName =
        ex.code === 'ECOMMANDREJECTED' ?
          `${command.name}Rejected` :
          `${command.name}Failed`;

      const errorEvent = new app.Event({
        context: command.context,
        aggregate: command.aggregate,
        name: errorEventName,
        data: {
          reason: ex.cause ? ex.cause.message : ex.message
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

    try {
      await publishEvents({
        eventbus: app.eventbus,
        flowbus: app.flowbus,
        eventStore,
        aggregateId: aggregate.instance.id,
        committedEvents
      });
    } catch (ex) {
      app.fail(ex);
    } finally {
      command.next();
    }
  });
};

module.exports = appLogic;

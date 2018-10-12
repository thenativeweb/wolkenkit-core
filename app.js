'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      flaschenpost = require('flaschenpost'),
      processenv = require('processenv'),
      tailwind = require('tailwind');

const eventStore = require(`wolkenkit-eventstore/${processenv('EVENTSTORE_TYPE')}`);

const logic = require('./appLogic'),
      publishEvents = require('./appLogic/publishEvents'),
      repository = require('./repository');

const loggerSystem = flaschenpost.getLogger();

(async () => {
  try {
    const app = tailwind.createApp({
      profiling: {
        host: processenv('PROFILING_HOST'),
        port: processenv('PROFILING_PORT')
      }
    });

    const applicationDirectory = path.join(app.dirname, 'app');
    const { writeModel } = await applicationManager.load({ directory: applicationDirectory });

    await eventStore.initialize({
      url: processenv('EVENTSTORE_URL'),
      namespace: `${processenv('APPLICATION')}domain`
    });

    repository.initialize({ app, writeModel, eventStore });

    await app.eventbus.use(new app.wires.eventbus.amqp.Sender({
      url: processenv('EVENTBUS_URL'),
      application: processenv('APPLICATION')
    }));

    await app.flowbus.use(new app.wires.flowbus.amqp.Sender({
      url: processenv('FLOWBUS_URL'),
      application: processenv('APPLICATION')
    }));

    const eventStream = await eventStore.getUnpublishedEventStream();

    await new Promise((resolve, reject) => {
      let onData,
          onEnd,
          onError;

      const unsubscribe = function () {
        eventStream.removeListener('data', onData);
        eventStream.removeListener('end', onEnd);
        eventStream.removeListener('error', onError);
      };

      onData = async function (event) {
        eventStream.pause();

        try {
          await publishEvents({
            eventbus: app.eventbus,
            flowbus: app.flowbus,
            eventStore,
            aggregateId: event.aggregate.id,
            committedEvents: [ event ]
          });
        } catch (ex) {
          return reject(ex);
        }

        eventStream.resume();
      };

      onEnd = function () {
        unsubscribe();
        resolve();
      };

      onError = function (err) {
        unsubscribe();
        reject(err);
      };

      eventStream.on('data', onData);
      eventStream.on('end', onEnd);
      eventStream.on('error', onError);
    });

    await app.commandbus.use(new app.wires.commandbus.amqp.Receiver({
      url: processenv('COMMANDBUS_URL'),
      application: processenv('APPLICATION'),
      prefetch: processenv('COMMANDBUS_CONCURRENCY')
    }));

    await app.status.use(new app.wires.status.http.Server({
      port: processenv('STATUS_PORT'),
      corsOrigin: processenv('STATUS_CORS_ORIGIN')
    }));

    logic({ app, writeModel, eventStore });
  } catch (ex) {
    loggerSystem.fatal('An unexpected error occured.', { err: ex });

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }
})();

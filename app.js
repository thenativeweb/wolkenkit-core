'use strict';

const path = require('path');

const flaschenpost = require('flaschenpost'),
      processEnv = require('processenv'),
      tailwind = require('tailwind'),
      WolkenkitApplication = require('wolkenkit-application');

const eventStore = require(`wolkenkit-eventstore/${processEnv('EVENTSTORE_TYPE')}`);

const logic = require('./appLogic'),
      publishEvents = require('./appLogic/publishEvents'),
      repository = require('./repository');

const loggerSystem = flaschenpost.getLogger();

(async () => {
  try {
    const app = tailwind.createApp({
      profiling: {
        host: processEnv('PROFILING_HOST'),
        port: processEnv('PROFILING_PORT')
      }
    });

    const applicationDirectory = path.join(app.dirname, 'app');
    const { writeModel } = new WolkenkitApplication(applicationDirectory);

    await eventStore.initialize({
      url: app.env('EVENTSTORE_URL'),
      namespace: `${app.env('APPLICATION')}domain`
    });

    repository.initialize({ app, writeModel, eventStore });

    await app.eventbus.use(new app.wires.eventbus.amqp.Sender({
      url: app.env('EVENTBUS_URL'),
      application: app.env('APPLICATION')
    }));

    await app.flowbus.use(new app.wires.flowbus.amqp.Sender({
      url: app.env('FLOWBUS_URL'),
      application: app.env('APPLICATION')
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
      url: app.env('COMMANDBUS_URL'),
      application: app.env('APPLICATION')
    }));

    await app.status.use(new app.wires.status.http.Server({
      port: app.env('STATUS_PORT'),
      corsOrigin: app.env('STATUS_CORS_ORIGIN')
    }));

    logic({ app, writeModel, eventStore });
  } catch (ex) {
    loggerSystem.fatal('An unexpected error occured.', { err: ex });

    /* eslint-disable no-process-exit */
    process.exit(1);
    /* eslint-enable no-process-exit */
  }
})();

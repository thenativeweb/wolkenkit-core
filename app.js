'use strict';

const path = require('path');

const processEnv = require('processenv'),
      tailwind = require('tailwind'),
      WolkenkitApplication = require('wolkenkit-application');

const eventStore = require(`sparbuch/${processEnv('EVENTSTORE_TYPE')}`);

const getPublishEvents = require('./appLogic/publishEvents'),
      logic = require('./appLogic'),
      repository = require('./repository');

const app = tailwind.createApp({
  profiling: {
    host: processEnv('PROFILING_HOST'),
    port: processEnv('PROFILING_PORT')
  }
});

const applicationDirectory = path.join(app.dirname, 'app');
const writeModel = new WolkenkitApplication(applicationDirectory).writeModel;

app.run([
  done => {
    eventStore.initialize({
      url: app.env('EVENTSTORE_URL'),
      namespace: `${app.env('APPLICATION')}domain`
    }, done);
  },
  done => {
    repository.initialize({ app, writeModel, eventStore }, done);
  },
  done => {
    app.eventbus.use(new app.wires.eventbus.amqp.Sender({
      url: app.env('EVENTBUS_URL'),
      application: app.env('APPLICATION')
    }), done);
  },
  done => {
    app.flowbus.use(new app.wires.flowbus.amqp.Sender({
      url: app.env('FLOWBUS_URL'),
      application: app.env('APPLICATION')
    }), done);
  },
  done => {
    const publishEvents = getPublishEvents({ eventbus: app.eventbus, flowbus: app.flowbus, eventStore });

    eventStore.getUnpublishedEventStream((errGetUnpublishedEvents, eventStream) => {
      if (errGetUnpublishedEvents) {
        return done(errGetUnpublishedEvents);
      }

      let onData,
          onEnd,
          onError;

      const unsubscribe = function () {
        eventStream.removeListener('data', onData);
        eventStream.removeListener('end', onEnd);
        eventStream.removeListener('error', onError);
      };

      onData = function (event) {
        eventStream.pause();
        publishEvents(event.aggregate.id, [ event ], err => {
          if (err) {
            return done(err);
          }
          eventStream.resume();
        });
      };

      onEnd = function () {
        unsubscribe();
        done(null);
      };

      onError = function (err) {
        unsubscribe();
        done(err);
      };

      eventStream.on('data', onData);
      eventStream.on('end', onEnd);
      eventStream.on('error', onError);
    });
  },
  done => {
    app.commandbus.use(new app.wires.commandbus.amqp.Receiver({
      url: app.env('COMMANDBUS_URL'),
      application: app.env('APPLICATION')
    }), done);
  },
  () => {
    logic({ app, writeModel, eventStore });
  }
]);

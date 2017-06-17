'use strict';

const EventEmitter = require('events').EventEmitter,
      path = require('path');

const assert = require('assertthat'),
      async = require('async'),
      EventStore = require('sparbuch/lib/postgres/Sparbuch'),
      hase = require('hase'),
      runfork = require('runfork'),
      shell = require('shelljs'),
      toArray = require('streamtoarray'),
      uuid = require('uuidv4');

const buildCommand = require('../helpers/buildCommand'),
      env = require('../helpers/env'),
      waitForHost = require('../helpers/waitForHost');

suite('integrationTests', function () {
  this.timeout(15 * 1000);

  let appLifecycle,
      commandbus,
      eventbus,
      eventStore,
      flowbus,
      mq,
      stopApp;

  const application = 'plcr',
        namespace = `${application}domain`;

  const waitForEvent = function (eventName, callback) {
    const getOnData = function (bus, done) {
      const onData = function (event) {
        event.next();

        if (event.payload.name !== eventName) {
          return;
        }

        bus.pause();
        bus.removeListener('data', onData);
        done(null, event);
      };

      return onData;
    };

    async.parallel({
      waitForEventbus (done) {
        eventbus.on('data', getOnData(eventbus, done));
        eventbus.resume();
      },
      waitForFlowbus (done) {
        flowbus.on('data', getOnData(flowbus, done));
        flowbus.resume();
      }
    }, (err, results) => {
      if (err) {
        return callback(err);
      }

      const eventFromEventbus = results.waitForEventbus,
            eventFromFlowbus = results.waitForFlowbus;

      if (eventFromEventbus.id !== eventFromFlowbus.id) {
        return callback(new Error('Event mismatch.'));
      }

      callback(results.waitForEventbus);
    });
  };

  setup(done => {
    const app = path.join(__dirname, '..', '..', 'app.js');

    appLifecycle = new EventEmitter();

    async.series([
      callback => {
        hase.connect(env.RABBITMQ_URL_INTEGRATION, (err, messageQueue) => {
          if (err) {
            return callback(err);
          }
          mq = messageQueue;
          callback();
        });
      },
      callback => {
        eventStore = new EventStore();
        eventStore.initialize({
          url: env.POSTGRES_URL_INTEGRATION,
          namespace
        }, callback);
      },
      callback => {
        mq.worker(`${application}::commands`).createWriteStream((err, commandStream) => {
          if (err) {
            return callback(err);
          }
          commandbus = commandStream;
          callback(null);
        });
      },
      callback => {
        mq.publisher(`${application}::events`).createReadStream((err, eventStream) => {
          if (err) {
            return callback(err);
          }
          eventbus = eventStream;
          callback(null);
        });
      },
      callback => {
        mq.worker(`${application}::flows`).createReadStream((err, flowStream) => {
          if (err) {
            return callback(err);
          }
          flowbus = flowStream;
          callback(null);
        });
      },
      callback => {
        runfork({
          path: path.join(__dirname, '..', 'helpers', 'runResetPostgres.js'),
          env: {
            NAMESPACE: namespace,
            URL: env.POSTGRES_URL_INTEGRATION
          },
          onExit (exitCode) {
            if (exitCode > 0) {
              return callback(new Error('Failed to reset PostgreSQL.'));
            }
            callback(null);
          }
        }, errfork => {
          if (errfork) {
            return callback(errfork);
          }
        });
      },
      callback => {
        runfork({
          path: app,
          env: {
            APPLICATION: application,
            COMMANDBUS_URL: env.RABBITMQ_URL_INTEGRATION,
            EVENTBUS_URL: env.RABBITMQ_URL_INTEGRATION,
            EVENTSTORE_URL: env.POSTGRES_URL_INTEGRATION,
            EVENTSTORE_TYPE: 'postgres',
            FLOWBUS_URL: env.RABBITMQ_URL_INTEGRATION,
            PROFILING_HOST: 'localhost',
            PROFILING_PORT: 8125
          },
          onExit (exitCode) {
            appLifecycle.emit('exit', exitCode);
          }
        }, (errRunApp, stop) => {
          if (errRunApp) {
            return callback(errRunApp);
          }

          stopApp = stop;
          setTimeout(() => {
            callback(null);
          }, 2 * 1000);
        });
      }
    ], done);
  });

  teardown(done => {
    mq.connection.close(errMq => {
      if (errMq && errMq.message !== 'Connection closed (Error: read ECONNRESET)') {
        return done(errMq);
      }

      // We don't explicitly run eventStore.destroy() here, because it caused
      // strange problems on CircleCI. The tests hang in the teardown function.
      // This can be tracked down to disposing and destroying the internal pool
      // of knex, which is provided by pool2. We don't have an idea WHY it works
      // this way, but apparently it does.

      // We need to delay stopping the app so that RabbitMQ has time to clean up
      // any messages left in the queue.
      setTimeout(() => {
        stopApp();
        done();
      }, 0.25 * 1000);
    });
  });

  test('exits when the connection to the command bus / event bus / flow bus is lost.', done => {
    appLifecycle.once('exit', () => {
      shell.exec('docker start rabbitmq-integration');
      waitForHost(env.RABBITMQ_URL_INTEGRATION, done);
    });

    shell.exec('docker kill rabbitmq-integration');
  });

  test('exits when the connection to the event store is lost.', done => {
    appLifecycle.once('exit', () => {
      shell.exec('docker start postgres-integration');
      waitForHost(env.POSTGRES_URL_INTEGRATION, err => {
        assert.that(err).is.null();

        // We need to wait for a few seconds after having started
        // PostgreSQL, as it (for whatever reason) takes a long time
        // to actually become available. If we don't do a sleep here,
        // we run into "the database system is starting up" errors.
        setTimeout(() => {
          done();
        }, 5 * 1000);
      });
    });

    shell.exec('docker kill postgres-integration');
  });

  test('does not write to the event store if a command is rejected.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinRejected', () => {
      eventStore.getEventStream(command.aggregate.id, (errGetEventStream, eventStream) => {
        assert.that(errGetEventStream).is.null();

        toArray(eventStream, (errToArray, events) => {
          assert.that(errToArray).is.null();
          assert.that(events.length).is.equalTo(0);
          done();
        });
      });
    });

    commandbus.write(command);
  });

  test('publishes a <Command>Rejected event if a command is rejected.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinRejected', event => {
      assert.that(event.payload.context.name).is.equalTo('planning');
      assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
      assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
      assert.that(event.payload.name).is.equalTo('joinRejected');
      assert.that(event.payload.data.reason).is.equalTo('Peer group does not exist.');
      assert.that(event.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
      done();
    });

    commandbus.write(command);
  });

  test('does not write to the event store if a command fails.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinAndFailFailed', () => {
      eventStore.getEventStream(command.aggregate.id, (errGetEventStream, eventStream) => {
        assert.that(errGetEventStream).is.null();

        toArray(eventStream, (errToArray, events) => {
          assert.that(errToArray).is.null();
          assert.that(events.length).is.equalTo(0);
          done();
        });
      });
    });

    commandbus.write(command);
  });

  test('publishes a <Command>Failed event if a command fails.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinAndFailFailed', event => {
      assert.that(event.payload.context.name).is.equalTo('planning');
      assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
      assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
      assert.that(event.payload.name).is.equalTo('joinAndFailFailed');
      assert.that(event.payload.data.reason).is.equalTo('Something, somewhere went horribly wrong...');
      assert.that(event.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
      done();
    });

    commandbus.write(command);
  });

  test('writes to the event store if a command is handled successfully.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joined', () => {
      eventStore.getEventStream(command.aggregate.id, (errGetEventStream, eventStream) => {
        assert.that(errGetEventStream).is.null();

        toArray(eventStream, (errToArray, events) => {
          assert.that(errToArray).is.null();
          assert.that(events.length).is.equalTo(3);
          assert.that(events[0].name).is.equalTo('transferredOwnership');
          assert.that(events[1].name).is.equalTo('started');
          assert.that(events[2].name).is.equalTo('joined');
          done();
        });
      });
    });

    commandbus.write(command);
  });

  test('publishes an event if a command is handled successfully.', done => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('started', eventStarted => {
      assert.that(eventStarted.payload.context.name).is.equalTo('planning');
      assert.that(eventStarted.payload.aggregate.name).is.equalTo('peerGroup');
      assert.that(eventStarted.payload.aggregate.id).is.equalTo(command.aggregate.id);
      assert.that(eventStarted.payload.name).is.equalTo('started');
      assert.that(eventStarted.payload.data.initiator).is.equalTo(command.data.initiator);
      assert.that(eventStarted.payload.data.destination).is.equalTo(command.data.destination);
      assert.that(eventStarted.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
      assert.that(eventStarted.payload.metadata.position).is.ofType('number');

      waitForEvent('joined', eventJoined => {
        assert.that(eventJoined.payload.context.name).is.equalTo('planning');
        assert.that(eventJoined.payload.aggregate.name).is.equalTo('peerGroup');
        assert.that(eventJoined.payload.aggregate.id).is.equalTo(command.aggregate.id);
        assert.that(eventJoined.payload.name).is.equalTo('joined');
        assert.that(eventJoined.payload.data.participant).is.equalTo(command.data.initiator);
        assert.that(eventJoined.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
        assert.that(eventJoined.payload.metadata.position).is.ofType('number');

        assert.that(eventStarted.payload.metadata.position + 1).is.equalTo(eventJoined.payload.metadata.position);
        done();
      });
    });

    commandbus.write(command);
  });

  test('publishes a <Command>Failed event if the context does not exist.', done => {
    const command = buildCommand('nonexistent', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinFailed', event => {
      assert.that(event.payload.context.name).is.equalTo('nonexistent');
      assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
      assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
      assert.that(event.payload.name).is.equalTo('joinFailed');
      assert.that(event.payload.data.reason).is.equalTo('Invalid context name.');
      done();
    });

    commandbus.write(command);
  });

  test('publishes a <Command>Failed event if the aggregate does not exist.', done => {
    const command = buildCommand('planning', 'nonexistent', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    waitForEvent('joinFailed', event => {
      assert.that(event.payload.context.name).is.equalTo('planning');
      assert.that(event.payload.aggregate.name).is.equalTo('nonexistent');
      assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
      assert.that(event.payload.name).is.equalTo('joinFailed');
      assert.that(event.payload.data.reason).is.equalTo('Invalid aggregate name.');
      done();
    });

    commandbus.write(command);
  });

  test('enables commands to load other aggregates.', done => {
    const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    start.addToken({
      sub: uuid()
    });

    const loadOtherAggregate = buildCommand('planning', 'peerGroup', uuid(), 'loadOtherAggregate', {
      otherAggregateId: start.aggregate.id
    });

    loadOtherAggregate.addToken({
      sub: uuid()
    });

    waitForEvent('loadedOtherAggregate', event => {
      assert.that(event.payload.data.initiator).is.equalTo('Jane Doe');
      assert.that(event.payload.data.destination).is.equalTo('Riva');
      done();
    });

    commandbus.write(start);
    commandbus.write(loadOtherAggregate);
  });

  suite('authorization', () => {
    suite('when access is limited to owner', () => {
      test('accepts commands from the owner.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addToken({
          sub: start.user.id
        });

        waitForEvent('joinedOnlyForOwner', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForOwner);
      });

      test('rejects commands from authenticated users.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addToken({
          sub: uuid()
        });

        waitForEvent('joinOnlyForOwnerRejected', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForOwner);
      });

      test('rejects commands from public users.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addToken({
          sub: 'anonymous'
        });

        waitForEvent('joinOnlyForOwnerRejected', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForOwner);
      });
    });

    suite('when access is limited to authenticated users', function () {
      test('accepts commands from the owner.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({
          sub: start.user.id
        });

        waitForEvent('joinedOnlyForAuthenticated', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForAuthenticated);
      });

      test('accepts commands from authenticated users.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({
          sub: uuid()
        });

        waitForEvent('joinedOnlyForAuthenticated', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForAuthenticated);
      });

      test('rejects commands from public users.', done => {
        this.timeout(10 * 60 * 1000);

        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({
          sub: 'anonymous'
        });

        waitForEvent('joinOnlyForAuthenticatedRejected', () => done());

        commandbus.write(start);
        commandbus.write(joinOnlyForAuthenticated);
      });
    });

    suite('when access is limited to authenticated and public users', () => {
      test('accepts commands from the owner.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addToken({
          sub: start.user.id
        });

        waitForEvent('joinedForPublic', () => done());

        commandbus.write(start);
        commandbus.write(joinForPublic);
      });

      test('accepts commands from authenticated users.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addToken({
          sub: uuid()
        });

        waitForEvent('joinedForPublic', () => done());

        commandbus.write(start);
        commandbus.write(joinForPublic);
      });

      test('accepts commands from public users.', done => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: uuid()
        });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addToken({
          sub: 'anonymous'
        });

        waitForEvent('joinedForPublic', () => done());

        commandbus.write(start);
        commandbus.write(joinForPublic);
      });
    });

    suite('granting and revoking access', () => {
      test('supports granting access for public users.', done => {
        const authorize = buildCommand('planning', 'peerGroup', uuid(), 'authorize', {
          commands: {
            joinOnlyForAuthenticated: { forPublic: true }
          }
        });

        authorize.addToken({
          sub: uuid()
        });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', authorize.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({
          sub: 'anonymous'
        });

        waitForEvent('joinedOnlyForAuthenticated', () => done());

        commandbus.write(authorize);
        commandbus.write(joinOnlyForAuthenticated);
      });

      test('supports revoking access for public users.', done => {
        const authorize = buildCommand('planning', 'peerGroup', uuid(), 'authorize', {
          commands: {
            joinForPublic: { forPublic: false }
          }
        });

        authorize.addToken({
          sub: uuid()
        });

        const joinForPublic = buildCommand('planning', 'peerGroup', authorize.aggregate.id, 'joinForPublic', {});

        joinForPublic.addToken({
          sub: 'anonymous'
        });

        waitForEvent('joinForPublicRejected', () => done());

        commandbus.write(authorize);
        commandbus.write(joinForPublic);
      });

      test('supports granting access for authenticated users.', done => {
        const authorize = buildCommand('planning', 'peerGroup', uuid(), 'authorize', {
          commands: {
            joinOnlyForOwner: { forAuthenticated: true }
          }
        });

        authorize.addToken({
          sub: uuid()
        });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', authorize.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addToken({
          sub: uuid()
        });

        waitForEvent('joinedOnlyForOwner', () => done());

        commandbus.write(authorize);
        commandbus.write(joinOnlyForOwner);
      });

      test('supports revoking access for authenticated users.', done => {
        const authorize = buildCommand('planning', 'peerGroup', uuid(), 'authorize', {
          commands: {
            joinOnlyForAuthenticated: { forAuthenticated: false }
          }
        });

        authorize.addToken({
          sub: uuid()
        });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', authorize.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({
          sub: uuid()
        });

        waitForEvent('joinOnlyForAuthenticatedRejected', () => done());

        commandbus.write(authorize);
        commandbus.write(joinOnlyForAuthenticated);
      });
    });

    test('supports impersonation.', done => {
      const originalUserId = uuid(),
            pretendedUserId = uuid();

      const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
        initiator: 'John Doe',
        destination: 'Somewhere over the rainbow'
      });

      command.custom.asUser = pretendedUserId;

      command.addToken({
        sub: originalUserId,
        'can-impersonate': true
      });

      waitForEvent('joined', event => {
        assert.that(event.payload.user.id).is.equalTo(pretendedUserId);
        done();
      });

      commandbus.write(command);
    });

    test('does not support impersonation for users who aren\'t allowed to.', done => {
      const originalUserId = uuid(),
            pretendedUserId = uuid();

      const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
        initiator: 'John Doe',
        destination: 'Somewhere over the rainbow'
      });

      command.custom.asUser = pretendedUserId;

      command.addToken({
        sub: originalUserId
      });

      waitForEvent('startRejected', event => {
        assert.that(event.payload.user.id).is.equalTo(originalUserId);
        done();
      });

      commandbus.write(command);
    });
  });
});

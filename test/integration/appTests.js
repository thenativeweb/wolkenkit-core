'use strict';

const { EventEmitter } = require('events'),
      path = require('path');

const assert = require('assertthat'),
      EventStore = require('wolkenkit-eventstore/dist/postgres/Eventstore'),
      hase = require('hase'),
      request = require('superagent'),
      runfork = require('runfork'),
      shell = require('shelljs'),
      toArray = require('streamtoarray'),
      uuid = require('uuidv4');

const buildCommand = require('../shared/buildCommand'),
      env = require('../shared/env'),
      waitForPostgres = require('../shared/waitForPostgres'),
      waitForRabbitMq = require('../shared/waitForRabbitMq');

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

  const waitForEvent = async function (predicate) {
    const getOnData = function (bus, resolve) {
      const onData = function (event) {
        event.next();

        if (!predicate(event.payload)) {
          return;
        }

        bus.pause();
        bus.removeListener('data', onData);
        resolve(event);
      };

      return onData;
    };

    const [ eventFromEventbus, eventFromFlowbus ] = await Promise.all([
      new Promise(resolve => {
        eventbus.on('data', getOnData(eventbus, resolve));
        eventbus.resume();
      }),
      new Promise(resolve => {
        flowbus.on('data', getOnData(flowbus, resolve));
        flowbus.resume();
      })
    ]);

    if (eventFromEventbus.id !== eventFromFlowbus.id) {
      throw new Error('Event mismatch.');
    }

    return eventFromEventbus;
  };

  setup(async () => {
    const app = path.join(__dirname, '..', '..', 'app.js');

    appLifecycle = new EventEmitter();

    mq = await hase.connect({
      url: env.RABBITMQ_URL_INTEGRATION
    });

    eventStore = new EventStore();
    await eventStore.initialize({
      url: env.POSTGRES_URL_INTEGRATION,
      namespace
    });

    commandbus = await mq.worker(`${application}::commands`).createWriteStream();
    eventbus = await mq.publisher(`${application}::events`).createReadStream();
    flowbus = await mq.worker(`${application}::flows`).createReadStream();

    await new Promise(async (resolve, reject) => {
      try {
        runfork({
          path: path.join(__dirname, '..', 'shared', 'runResetPostgres.js'),
          env: {
            NAMESPACE: namespace,
            URL: env.POSTGRES_URL_INTEGRATION
          },
          onExit (exitCode) {
            if (exitCode > 0) {
              return reject(new Error('Failed to reset PostgreSQL.'));
            }
            resolve();
          }
        });
      } catch (ex) {
        reject(ex);
      }
    });

    stopApp = runfork({
      path: app,
      env: {
        APPLICATION: application,
        COMMANDBUS_URL: env.RABBITMQ_URL_INTEGRATION,
        EVENTBUS_URL: env.RABBITMQ_URL_INTEGRATION,
        EVENTSTORE_URL: env.POSTGRES_URL_INTEGRATION,
        EVENTSTORE_TYPE: 'postgres',
        FLOWBUS_URL: env.RABBITMQ_URL_INTEGRATION,
        PROFILING_HOST: 'localhost',
        PROFILING_PORT: 8125,
        STATUS_PORT: 3001,
        STATUS_CORS_ORIGIN: '*'
      },
      onExit (exitCode) {
        appLifecycle.emit('exit', exitCode);
      }
    });

    await new Promise(resolve => setTimeout(resolve, 2 * 1000));
  });

  teardown(async () => {
    try {
      await mq.connection.close();
    } catch (ex) {
      if (ex.message !== 'Connection closed (Error: Unexpected close)') {
        throw ex;
      }
    }

    await eventStore.destroy();
    await stopApp();
  });

  test('exits when the connection to the command bus / event bus / flow bus is lost.', async () => {
    await new Promise((resolve, reject) => {
      try {
        appLifecycle.once('exit', async () => {
          try {
            shell.exec('docker start rabbitmq-integration');
            await waitForRabbitMq({ url: env.RABBITMQ_URL_INTEGRATION });
          } catch (ex) {
            return reject(ex);
          }
          resolve();
        });

        shell.exec('docker kill rabbitmq-integration');
      } catch (ex) {
        reject(ex);
      }
    });
  });

  test('exits when the connection to the event store is lost.', async () => {
    await new Promise((resolve, reject) => {
      try {
        appLifecycle.once('exit', async () => {
          try {
            shell.exec('docker start postgres-integration');
            await waitForPostgres({
              url: env.POSTGRES_URL_INTEGRATION
            });

            // We need to wait for a few seconds after having started
            // PostgreSQL, as it (for whatever reason) takes a long time to
            // actually become available. If we don't do a sleep here, we run
            // into "the database system is starting up" errors.
            await new Promise(resolveTimeout => setTimeout(resolveTimeout, 5 * 1000));
          } catch (ex) {
            return reject(ex);
          }
          resolve();
        });

        shell.exec('docker kill postgres-integration');
      } catch (ex) {
        reject(ex);
      }
    });
  });

  test('does not write to the event store if a command is rejected.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    await Promise.all([
      waitForEvent(event =>
        event.name === 'joinRejected' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream(command.aggregate.id);
    const events = await toArray(eventStream);

    assert.that(events.length).is.equalTo(0);
  });

  test('publishes a <Command>Rejected event if a command is rejected.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    const [ event ] = await Promise.all([
      waitForEvent(evt =>
        evt.name === 'joinRejected' &&
        evt.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    assert.that(event.payload.context.name).is.equalTo('planning');
    assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
    assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(event.payload.name).is.equalTo('joinRejected');
    assert.that(event.payload.data.reason).is.equalTo('Peer group does not exist.');
    assert.that(event.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
  });

  test('does not write to the event store if a command fails.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    await Promise.all([
      waitForEvent(event =>
        event.name === 'joinAndFailFailed' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream(command.aggregate.id);
    const events = await toArray(eventStream);

    assert.that(events.length).is.equalTo(0);
  });

  test('publishes a <Command>Failed event if a command fails.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    const [ event ] = await Promise.all([
      waitForEvent(evt =>
        evt.name === 'joinAndFailFailed' &&
        evt.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    assert.that(event.payload.context.name).is.equalTo('planning');
    assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
    assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(event.payload.name).is.equalTo('joinAndFailFailed');
    assert.that(event.payload.data.reason).is.equalTo('Something, somewhere went horribly wrong...');
    assert.that(event.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
  });

  test('writes to the event store if a command is handled successfully.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    command.addToken({
      sub: uuid()
    });

    await Promise.all([
      waitForEvent(event =>
        event.name === 'joined' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream(command.aggregate.id);
    const events = await toArray(eventStream);

    assert.that(events.length).is.equalTo(3);
    assert.that(events[0].name).is.equalTo('transferredOwnership');
    assert.that(events[1].name).is.equalTo('started');
    assert.that(events[2].name).is.equalTo('joined');
  });

  test('publishes an event if a command is handled successfully.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    command.addToken({
      sub: uuid()
    });

    const [[ eventStarted, eventJoined ]] = await Promise.all([
      new Promise(async resolve => {
        const evtStarted = await waitForEvent(evt =>
          evt.name === 'started' &&
          evt.aggregate.id === command.aggregate.id);

        const evtJoined = await waitForEvent(evt =>
          evt.name === 'joined' &&
          evt.aggregate.id === command.aggregate.id);

        resolve([ evtStarted, evtJoined ]);
      }),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    assert.that(eventStarted.payload.context.name).is.equalTo('planning');
    assert.that(eventStarted.payload.aggregate.name).is.equalTo('peerGroup');
    assert.that(eventStarted.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(eventStarted.payload.name).is.equalTo('started');
    assert.that(eventStarted.payload.data.initiator).is.equalTo(command.data.initiator);
    assert.that(eventStarted.payload.data.destination).is.equalTo(command.data.destination);
    assert.that(eventStarted.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
    assert.that(eventStarted.payload.metadata.position).is.ofType('number');

    assert.that(eventJoined.payload.context.name).is.equalTo('planning');
    assert.that(eventJoined.payload.aggregate.name).is.equalTo('peerGroup');
    assert.that(eventJoined.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(eventJoined.payload.name).is.equalTo('joined');
    assert.that(eventJoined.payload.data.participant).is.equalTo(command.data.initiator);
    assert.that(eventJoined.payload.metadata.correlationId).is.equalTo(command.metadata.correlationId);
    assert.that(eventJoined.payload.metadata.position).is.ofType('number');

    assert.that(eventStarted.payload.metadata.position + 1).is.equalTo(eventJoined.payload.metadata.position);
  });

  test('publishes a <Command>Failed event if the context does not exist.', async () => {
    const command = buildCommand('nonexistent', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    const [ event ] = await Promise.all([
      waitForEvent(evt =>
        evt.name === 'joinFailed' &&
        evt.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    assert.that(event.payload.context.name).is.equalTo('nonexistent');
    assert.that(event.payload.aggregate.name).is.equalTo('peerGroup');
    assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(event.payload.name).is.equalTo('joinFailed');
    assert.that(event.payload.data.reason).is.equalTo('Invalid context name.');
  });

  test('publishes a <Command>Failed event if the aggregate does not exist.', async () => {
    const command = buildCommand('planning', 'nonexistent', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addToken({
      sub: uuid()
    });

    const [ event ] = await Promise.all([
      waitForEvent(evt =>
        evt.name === 'joinFailed' &&
        evt.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write(command);
        resolve();
      })
    ]);

    assert.that(event.payload.context.name).is.equalTo('planning');
    assert.that(event.payload.aggregate.name).is.equalTo('nonexistent');
    assert.that(event.payload.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(event.payload.name).is.equalTo('joinFailed');
    assert.that(event.payload.data.reason).is.equalTo('Invalid aggregate name.');
  });

  test('enables commands to load other aggregates.', async () => {
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

    await Promise.all([
      waitForEvent(evt =>
        evt.name === 'started'),
      new Promise(resolve => {
        commandbus.write(start);
        resolve();
      })
    ]);

    const [ event ] = await Promise.all([
      waitForEvent(evt =>
        evt.name === 'loadedOtherAggregate' &&
        evt.aggregate.id === loadOtherAggregate.aggregate.id),
      new Promise(resolve => {
        commandbus.write(loadOtherAggregate);
        resolve();
      })
    ]);

    assert.that(event.payload.data.initiator).is.equalTo('Jane Doe');
    assert.that(event.payload.data.destination).is.equalTo('Riva');
  });

  suite('authorization', () => {
    suite('when access is limited to owner', () => {
      test('accepts commands from the owner.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedOnlyForOwner' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForOwner);
            resolve();
          })
        ]);
      });

      test('rejects commands from authenticated users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinOnlyForOwnerRejected' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForOwner);
            resolve();
          })
        ]);
      });

      test('rejects commands from public users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinOnlyForOwnerRejected' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForOwner);
            resolve();
          })
        ]);
      });

      test('rejects constructor commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'startForOwner', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: 'anonymous'
        });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'startForOwnerRejected' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            resolve();
          })
        ]);
      });
    });

    suite('when access is limited to authenticated users', function () {
      test('accepts commands from the owner.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedOnlyForAuthenticated' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForAuthenticated);
            resolve();
          })
        ]);
      });

      test('accepts commands from authenticated users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedOnlyForAuthenticated' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForAuthenticated);
            resolve();
          })
        ]);
      });

      test('rejects commands from public users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinOnlyForAuthenticatedRejected' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinOnlyForAuthenticated);
            resolve();
          })
        ]);
      });

      test('rejects constructor commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'startForAuthenticated', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({
          sub: 'anonymous'
        });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'startForAuthenticatedRejected' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            resolve();
          })
        ]);
      });
    });

    suite('when access is limited to authenticated and public users', () => {
      test('accepts commands from the owner.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedForPublic' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinForPublic);
            resolve();
          })
        ]);
      });

      test('accepts commands from authenticated users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedForPublic' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinForPublic);
            resolve();
          })
        ]);
      });

      test('accepts commands from public users.', async () => {
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

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedForPublic' &&
            evt.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(joinForPublic);
            resolve();
          })
        ]);
      });
    });

    suite('granting and revoking access', () => {
      test('supports granting access for public users.', async () => {
        const aggregateId = uuid(),
              sub = uuid();

        const start = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({ sub });

        const authorize = buildCommand('planning', 'peerGroup', aggregateId, 'authorize', {
          commands: {
            joinOnlyForAuthenticated: { forPublic: true }
          }
        });

        authorize.addToken({ sub });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', aggregateId, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({ sub: 'anonymous' });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedOnlyForAuthenticated' &&
            evt.aggregate.id === aggregateId),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(authorize);
            commandbus.write(joinOnlyForAuthenticated);
            resolve();
          })
        ]);
      });

      test('supports revoking access for public users.', async () => {
        const aggregateId = uuid(),
              sub = uuid();

        const start = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({ sub });

        const authorize = buildCommand('planning', 'peerGroup', aggregateId, 'authorize', {
          commands: {
            joinForPublic: { forPublic: false }
          }
        });

        authorize.addToken({ sub });

        const joinForPublic = buildCommand('planning', 'peerGroup', aggregateId, 'joinForPublic', {});

        joinForPublic.addToken({ sub: 'anonymous' });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinForPublicRejected' &&
            evt.aggregate.id === aggregateId),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(authorize);
            commandbus.write(joinForPublic);
            resolve();
          })
        ]);
      });

      test('supports granting access for authenticated users.', async () => {
        const aggregateId = uuid(),
              sub = uuid(),
              subOther = uuid();

        const start = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({ sub });

        const authorize = buildCommand('planning', 'peerGroup', aggregateId, 'authorize', {
          commands: {
            joinOnlyForOwner: { forAuthenticated: true }
          }
        });

        authorize.addToken({ sub });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', aggregateId, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addToken({ sub: subOther });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinedOnlyForOwner' &&
            evt.aggregate.id === aggregateId),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(authorize);
            commandbus.write(joinOnlyForOwner);
            resolve();
          })
        ]);
      });

      test('supports revoking access for authenticated users.', async () => {
        const aggregateId = uuid(),
              sub = uuid(),
              subOther = uuid();

        const start = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addToken({ sub });

        const authorize = buildCommand('planning', 'peerGroup', aggregateId, 'authorize', {
          commands: {
            joinOnlyForAuthenticated: { forAuthenticated: false }
          }
        });

        authorize.addToken({ sub });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', aggregateId, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addToken({ sub: subOther });

        await Promise.all([
          waitForEvent(evt =>
            evt.name === 'joinOnlyForAuthenticatedRejected' &&
            evt.aggregate.id === aggregateId),
          new Promise(resolve => {
            commandbus.write(start);
            commandbus.write(authorize);
            commandbus.write(joinOnlyForAuthenticated);
            resolve();
          })
        ]);
      });
    });

    test('supports impersonation.', async () => {
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

      const [ event ] = await Promise.all([
        waitForEvent(evt =>
          evt.name === 'joined' &&
          evt.aggregate.id === command.aggregate.id),
        new Promise(resolve => {
          commandbus.write(command);
          resolve();
        })
      ]);

      assert.that(event.payload.user.id).is.equalTo(pretendedUserId);
    });

    test('does not support impersonation for users who aren\'t allowed to.', async () => {
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

      const [ event ] = await Promise.all([
        waitForEvent(evt =>
          evt.name === 'startRejected' &&
          evt.aggregate.id === command.aggregate.id),
        new Promise(resolve => {
          commandbus.write(command);
          resolve();
        })
      ]);

      assert.that(event.payload.user.id).is.equalTo(originalUserId);
    });
  });

  suite('status api', () => {
    test('answers with api version v1.', async () => {
      const res = await request.get('http://localhost:3001/v1/status');

      assert.that(res.body).is.equalTo({ api: 'v1' });
    });
  });
});

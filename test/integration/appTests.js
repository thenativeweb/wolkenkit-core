'use strict';

const { EventEmitter } = require('events'),
      path = require('path');

const assert = require('assertthat'),
      EventStore = require('wolkenkit-eventstore/lib/postgres/EventStore'),
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

const isDebugMode = false;

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
      const onData = function (message) {
        message.next();

        const { event, metadata } = message.payload;

        if (!predicate({ event, metadata })) {
          return;
        }

        bus.pause();
        bus.removeListener('data', onData);
        resolve({ event, metadata });
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
        COMMANDBUS_CONCURRENCY: 256,
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
      },
      silent: !isDebugMode
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

  test('does not write to the event store if a command is rejected.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinRejected' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream({ aggregateId: command.aggregate.id });
    const events = await toArray(eventStream);

    assert.that(events.length).is.equalTo(0);
  });

  test('publishes a <Command>Rejected event if a command is rejected.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    const [ joinRejected ] = await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinRejected' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(joinRejected.event.context.name).is.equalTo('planning');
    assert.that(joinRejected.event.aggregate.name).is.equalTo('peerGroup');
    assert.that(joinRejected.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(joinRejected.event.name).is.equalTo('joinRejected');
    assert.that(joinRejected.event.data.reason).is.equalTo('Peer group does not exist.');
    assert.that(joinRejected.event.metadata.correlationId).is.equalTo(command.metadata.correlationId);
  });

  test('does not write to the event store if a command fails.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinAndFailFailed' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream({ aggregateId: command.aggregate.id });
    const events = await toArray(eventStream);

    assert.that(events.length).is.equalTo(0);
  });

  test('publishes a <Command>Failed event if a command fails.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    const [ joinAndFailFailed ] = await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinAndFailFailed' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(joinAndFailFailed.event.context.name).is.equalTo('planning');
    assert.that(joinAndFailFailed.event.aggregate.name).is.equalTo('peerGroup');
    assert.that(joinAndFailFailed.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(joinAndFailFailed.event.name).is.equalTo('joinAndFailFailed');
    assert.that(joinAndFailFailed.event.data.reason).is.equalTo('Something, somewhere went horribly wrong...');
    assert.that(joinAndFailFailed.event.metadata.correlationId).is.equalTo(command.metadata.correlationId);
  });

  test('writes to the event store if a command is handled successfully.', async () => {
    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    command.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joined' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    const eventStream = await eventStore.getEventStream({ aggregateId: command.aggregate.id });
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

    command.addInitiator({ token: { sub: uuid() }});

    const [[ started, joined ]] = await Promise.all([
      new Promise(async resolve => {
        const eventStarted = await waitForEvent(({ event }) =>
          event.name === 'started' &&
          event.aggregate.id === command.aggregate.id);

        const eventJoined = await waitForEvent(({ event }) =>
          event.name === 'joined' &&
          event.aggregate.id === command.aggregate.id);

        resolve([ eventStarted, eventJoined ]);
      }),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(started.event.context.name).is.equalTo('planning');
    assert.that(started.event.aggregate.name).is.equalTo('peerGroup');
    assert.that(started.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(started.event.name).is.equalTo('started');
    assert.that(started.event.data.initiator).is.equalTo(command.data.initiator);
    assert.that(started.event.data.destination).is.equalTo(command.data.destination);
    assert.that(started.event.metadata.correlationId).is.equalTo(command.metadata.correlationId);
    assert.that(started.event.metadata.position).is.ofType('number');

    assert.that(joined.event.context.name).is.equalTo('planning');
    assert.that(joined.event.aggregate.name).is.equalTo('peerGroup');
    assert.that(joined.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(joined.event.name).is.equalTo('joined');
    assert.that(joined.event.data.participant).is.equalTo(command.data.initiator);
    assert.that(joined.event.metadata.correlationId).is.equalTo(command.metadata.correlationId);
    assert.that(joined.event.metadata.position).is.ofType('number');

    assert.that(started.event.metadata.position + 1).is.equalTo(
      joined.event.metadata.position
    );
  });

  test('publishes a <Command>Failed event if the context does not exist.', async () => {
    const command = buildCommand('nonexistent', 'peerGroup', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    const [ joinFailed ] = await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinFailed' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(joinFailed.event.context.name).is.equalTo('nonexistent');
    assert.that(joinFailed.event.aggregate.name).is.equalTo('peerGroup');
    assert.that(joinFailed.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(joinFailed.event.name).is.equalTo('joinFailed');
    assert.that(joinFailed.event.data.reason).is.equalTo('Invalid context name.');
  });

  test('publishes a <Command>Failed event if the aggregate does not exist.', async () => {
    const command = buildCommand('planning', 'nonexistent', uuid(), 'join', {
      participant: 'John Doe'
    });

    command.addInitiator({ token: { sub: uuid() }});

    const [ joinFailed ] = await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'joinFailed' &&
        event.aggregate.id === command.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(joinFailed.event.context.name).is.equalTo('planning');
    assert.that(joinFailed.event.aggregate.name).is.equalTo('nonexistent');
    assert.that(joinFailed.event.aggregate.id).is.equalTo(command.aggregate.id);
    assert.that(joinFailed.event.name).is.equalTo('joinFailed');
    assert.that(joinFailed.event.data.reason).is.equalTo('Invalid aggregate name.');
  });

  test('provides the aggregate api.', async () => {
    const aggregateId = uuid();
    const sub = uuid();

    const commandStart = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    commandStart.addInitiator({ token: { sub }});

    const commandValidateAggregateApi = buildCommand('planning', 'peerGroup', aggregateId, 'validateAggregateApi', {});

    commandValidateAggregateApi.addInitiator({ token: { sub }});

    const [[ validatedAggregateApi ]] = await Promise.all([
      new Promise(async resolve => {
        await waitForEvent(({ event }) =>
          event.name === 'joined' &&
          event.aggregate.id === commandStart.aggregate.id);

        const eventValidatedAggregateApi = await waitForEvent(({ event }) =>
          event.name === 'validatedAggregateApi' &&
          event.aggregate.id === commandValidateAggregateApi.aggregate.id);

        resolve([ eventValidatedAggregateApi ]);
      }),
      new Promise(resolve => {
        commandbus.write({ command: commandStart, metadata: { client: {}}});
        commandbus.write({ command: commandValidateAggregateApi, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(validatedAggregateApi.event.data.id).is.equalTo(aggregateId);
  });

  test('enables commands to load other aggregates.', async () => {
    const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    start.addInitiator({ token: { sub: uuid() }});

    const loadOtherAggregate = buildCommand('planning', 'peerGroup', uuid(), 'loadOtherAggregate', {
      otherAggregateId: start.aggregate.id
    });

    loadOtherAggregate.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'started'),
      new Promise(resolve => {
        commandbus.write({ command: start, metadata: { client: {}}});
        resolve();
      })
    ]);

    const [ loadedOtherAggregate ] = await Promise.all([
      waitForEvent(({ event }) =>
        event.name === 'loadedOtherAggregate' &&
        event.aggregate.id === loadOtherAggregate.aggregate.id),
      new Promise(resolve => {
        commandbus.write({ command: loadOtherAggregate, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(loadedOtherAggregate.event.data.initiator).is.equalTo('Jane Doe');
    assert.that(loadedOtherAggregate.event.data.destination).is.equalTo('Riva');
  });

  test('runs commands for different aggregate instances in parallel.', async () => {
    const eventOrder = [];

    const blockingCommand = buildCommand('planning', 'peerGroup', uuid(), 'triggerLongRunningCommand', {
      duration: 1000
    });

    blockingCommand.addInitiator({ token: { sub: uuid() }});

    const immediateCommand = buildCommand('planning', 'peerGroup', uuid(), 'triggerImmediateCommand', {
      initiator: 'John Doe',
      destination: 'Somewhere over the rainbow'
    });

    immediateCommand.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) => {
        eventOrder.push(event.name);

        if (event.name === 'finishedLongRunningCommand') {
          return true;
        }

        return false;
      }),
      new Promise(resolve => {
        commandbus.write({ command: blockingCommand, metadata: { client: {}}});
        commandbus.write({ command: immediateCommand, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(eventOrder).is.equalTo([
      'finishedImmediateCommand',
      'finishedImmediateCommand',
      'finishedLongRunningCommand',
      'finishedLongRunningCommand'
    ]);
  });

  test('runs commands for one aggregate instances in series.', async () => {
    const eventOrder = [];

    const longRunningCommand = buildCommand('planning', 'peerGroup', uuid(), 'triggerLongRunningCommand', {
      duration: 1000
    });

    longRunningCommand.addInitiator({ token: { sub: uuid() }});

    const immediateCommand = buildCommand('planning', 'peerGroup', longRunningCommand.aggregate.id, 'triggerImmediateCommand', {});

    immediateCommand.addInitiator({ token: { sub: uuid() }});

    await Promise.all([
      waitForEvent(({ event }) => {
        eventOrder.push(event.name);

        if (event.name === 'finishedImmediateCommand') {
          return true;
        }

        return false;
      }),
      new Promise(resolve => {
        commandbus.write({ command: longRunningCommand, metadata: { client: {}}});
        commandbus.write({ command: immediateCommand, metadata: { client: {}}});
        resolve();
      })
    ]);

    assert.that(eventOrder).is.equalTo([
      'finishedLongRunningCommand',
      'finishedLongRunningCommand',
      'finishedImmediateCommand',
      'finishedImmediateCommand'
    ]);
  });

  suite('authorization', () => {
    let tokens,
        users;

    suiteSetup(async () => {
      tokens = {
        jane: { sub: uuid() },
        john: { sub: uuid() },
        public: { sub: 'anonymous' },
        janeCanImpersonate: { sub: uuid(), 'can-impersonate': true }
      };

      users = {
        jane: { id: tokens.jane.sub, token: tokens.jane },
        john: { id: tokens.john.sub, token: tokens.john },
        public: { id: tokens.public.sub, token: tokens.public },
        janeCanImpersonate: { id: tokens.janeCanImpersonate.sub, token: tokens.janeCanImpersonate }
      };
    });

    suite('when access is limited to owner', () => {
      test('accepts commands from the owner.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addInitiator({ token: tokens.jane });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedOnlyForOwner' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForOwner, metadata: { client: { user: users.jane }}});
            resolve();
          })
        ]);
      });

      test('rejects commands from authenticated users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addInitiator({ token: tokens.john });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinOnlyForOwnerRejected' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForOwner, metadata: { client: { user: users.john }}});
            resolve();
          })
        ]);
      });

      test('rejects commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForOwner = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForOwner', {});

        joinOnlyForOwner.addInitiator({ token: tokens.public });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinOnlyForOwnerRejected' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForOwner, metadata: { client: { user: users.public }}});
            resolve();
          })
        ]);
      });

      test('rejects constructor commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'startForOwner', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.public });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'startForOwnerRejected' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.public }}});
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

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addInitiator({ token: tokens.jane });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedOnlyForAuthenticated' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForAuthenticated, metadata: { client: { user: users.jane }}});
            resolve();
          })
        ]);
      });

      test('accepts commands from authenticated users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addInitiator({ token: tokens.john });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedOnlyForAuthenticated' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForAuthenticated, metadata: { client: { user: users.john }}});
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

        start.addInitiator({ token: tokens.jane });

        const joinOnlyForAuthenticated = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinOnlyForAuthenticated', {});

        joinOnlyForAuthenticated.addInitiator({ token: tokens.public });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinOnlyForAuthenticatedRejected' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinOnlyForAuthenticated, metadata: { client: { user: users.public }}});
            resolve();
          })
        ]);
      });

      test('rejects constructor commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'startForAuthenticated', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.public });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'startForAuthenticatedRejected' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.public }}});
            resolve();
          })
        ]);
      });
    });

    suite('when access is limited to public users', () => {
      test('accepts commands from the owner.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addInitiator({ token: tokens.jane });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedForPublic' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinForPublic, metadata: { client: { user: users.jane }}});
            resolve();
          })
        ]);
      });

      test('accepts commands from authenticated users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addInitiator({ token: tokens.john });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedForPublic' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinForPublic, metadata: { client: { user: users.john }}});
            resolve();
          })
        ]);
      });

      test('accepts commands from public users.', async () => {
        const start = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        start.addInitiator({ token: tokens.jane });

        const joinForPublic = buildCommand('planning', 'peerGroup', start.aggregate.id, 'joinForPublic', {});

        joinForPublic.addInitiator({ token: tokens.public });

        await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joinedForPublic' &&
            event.aggregate.id === start.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command: start, metadata: { client: { user: users.jane }}});
            commandbus.write({ command: joinForPublic, metadata: { client: { user: users.public }}});
            resolve();
          })
        ]);
      });
    });

    suite('impersonation', () => {
      test('supports impersonation.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'John Doe',
          destination: 'Somewhere over the rainbow'
        });

        command.addInitiator({ token: tokens.janeCanImpersonate });

        command.custom.asInitiator = tokens.john.sub;

        const [ joined ] = await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'joined' &&
            event.aggregate.id === command.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command, metadata: { client: { user: users.janeCanImpersonate }}});
            resolve();
          })
        ]);

        assert.that(joined.event.initiator.id).is.equalTo(tokens.john.sub);
      });

      test('does not support impersonation for users who aren\'t allowed to.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
          initiator: 'John Doe',
          destination: 'Somewhere over the rainbow'
        });

        command.addInitiator({ token: tokens.jane });

        command.custom.asInitiator = tokens.john.sub;

        const [ startRejected ] = await Promise.all([
          waitForEvent(({ event }) =>
            event.name === 'startRejected' &&
            event.aggregate.id === command.aggregate.id),
          new Promise(resolve => {
            commandbus.write({ command, metadata: { client: { user: users.jane }}});
            resolve();
          })
        ]);

        assert.that(startRejected.event.initiator.id).is.equalTo(tokens.jane.sub);
      });
    });
  });

  suite('status api', () => {
    test('answers with api version v1.', async () => {
      const res = await request.get('http://localhost:3001/v1/status');

      assert.that(res.body).is.equalTo({ api: 'v1' });
    });
  });

  suite('infrastructure recovery', () => {
    test('exits when the connection to the command bus / event bus / flow bus is lost.', async function () {
      this.timeout(25 * 1000);

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
              await eventStore.initialize({
                url: env.POSTGRES_URL_INTEGRATION,
                namespace
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
  });
});

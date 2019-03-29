'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      cloneDeep = require('lodash/cloneDeep'),
      eventStore = require('wolkenkit-eventstore/inmemory'),
      tailwind = require('tailwind'),
      toArray = require('streamtoarray'),
      uuid = require('uuidv4');

const buildCommand = require('../../shared/buildCommand'),
      buildEvent = require('../../shared/buildEvent'),
      Repository = require('../../../repository/Repository');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('Repository', () => {
  let writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', 'app')
    })).writeModel;

    await eventStore.initialize();
  });

  teardown(async () => {
    await eventStore.destroy();
  });

  test('is a function.', async () => {
    assert.that(Repository).is.ofType('function');
  });

  suite('initialize', () => {
    let repository;

    setup(() => {
      repository = new Repository();
    });

    test('is a function.', async () => {
      assert.that(repository.initialize).is.ofType('function');
    });

    test('throws an error if app is missing.', async () => {
      assert.that(() => {
        repository.initialize({});
      }).is.throwing('App is missing.');
    });

    test('throws an error if write model is missing.', async () => {
      assert.that(() => {
        repository.initialize({ app });
      }).is.throwing('Write model is missing.');
    });

    test('throws an error if event store is missing.', async () => {
      assert.that(() => {
        repository.initialize({ app, writeModel });
      }).is.throwing('Event store is missing.');
    });

    test('initializes the repository.', async () => {
      assert.that(() => {
        repository.initialize({ app, writeModel, eventStore });
      }).is.not.throwing();
    });
  });

  suite('instance', () => {
    let aggregate,
        command,
        repository;

    setup(() => {
      repository = new Repository();
      repository.initialize({ app, eventStore, writeModel });

      const aggregateId = uuid();

      const token = { sub: uuid() };

      command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
        participant: 'Jane Doe'
      });

      command.addInitiator({ token });

      aggregate = new app.WritableAggregate({
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        command
      });
    });

    suite('saveAggregate', () => {
      test('is a function.', async () => {
        assert.that(repository.saveAggregate).is.ofType('function');
      });

      test('throws an error if aggregate is missing.', async () => {
        await assert.that(async () => {
          await repository.saveAggregate();
        }).is.throwingAsync('Aggregate is missing.');
      });

      test('does nothing when there are no uncommitted events.', async () => {
        await repository.saveAggregate(aggregate);

        const eventStream = await eventStore.getEventStream({ aggregateId: aggregate.instance.id });
        const events = await toArray(eventStream);

        assert.that(events.length).is.equalTo(0);
      });

      test('saves a single uncommitted event to the event store.', async () => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });

        await repository.saveAggregate(aggregate);

        const eventStream = await eventStore.getEventStream({ aggregateId: aggregate.instance.id });
        const events = await toArray(eventStream);

        assert.that(events.length).is.equalTo(1);
        assert.that(events[0].name).is.equalTo('started');
        assert.that(events[0].data).is.equalTo({ initiator: 'Jane Doe', destination: 'Riva' });
      });

      test('saves multiple uncommitted events to the event store.', async () => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });
        aggregate.api.forCommands.events.publish('joined', { participant: 'Jane Doe' });

        await repository.saveAggregate(aggregate);

        const eventStream = await eventStore.getEventStream({ aggregateId: aggregate.instance.id });
        const events = await toArray(eventStream);

        assert.that(events.length).is.equalTo(2);
        assert.that(events[0].name).is.equalTo('started');
        assert.that(events[0].data).is.equalTo({ initiator: 'Jane Doe', destination: 'Riva' });
        assert.that(events[1].name).is.equalTo('joined');
        assert.that(events[1].data).is.equalTo({ participant: 'Jane Doe' });
      });

      test('returns the committed events from the event store.', async () => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });
        aggregate.api.forCommands.events.publish('joined', { participant: 'Jane Doe' });

        const committedEvents = await repository.saveAggregate(aggregate);

        assert.that(committedEvents.length).is.equalTo(2);
        assert.that(committedEvents[0].event.metadata.position).is.ofType('number');
        assert.that(committedEvents[1].event.metadata.position).is.ofType('number');
        assert.that(committedEvents[0].event.metadata.position + 1).is.equalTo(
          committedEvents[1].event.metadata.position
        );
      });

      test('returns an empty list of committed events when there were no uncommited events.', async () => {
        const committedEvents = await repository.saveAggregate(aggregate);

        assert.that(committedEvents).is.equalTo([]);
      });
    });

    suite('replayAggregate', () => {
      test('is a function.', async () => {
        assert.that(repository.replayAggregate).is.ofType('function');
      });

      test('throws an error if aggregate is missing.', async () => {
        await assert.that(async () => {
          await repository.replayAggregate();
        }).is.throwingAsync('Aggregate is missing.');
      });

      test('returns the aggregate as-is if no events have been saved.', async () => {
        const oldState = cloneDeep(aggregate.api.forReadOnly.state);

        const aggregateReplayed = await repository.replayAggregate(aggregate);

        assert.that(aggregateReplayed.api.forReadOnly.state).is.equalTo(oldState);
      });

      test('throws an error if the aggregate type does not match the events.', async () => {
        const started = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'started', {
          initiator: 'Jane Doe',
          destination: 'Riva',
          participants: []
        });
        const joined = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        started.metadata.revision = 1;
        joined.metadata.revision = 2;

        await eventStore.saveEvents({
          uncommittedEvents: [
            { event: started, state: {}},
            { event: joined, state: {}}
          ]
        });

        command = buildCommand('planning', 'none', aggregate.instance.id, 'nonExistent', {});
        command.addInitiator({ token: { sub: uuid() }});

        aggregate = new app.WritableAggregate({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'none', id: aggregate.instance.id },
          command
        });

        await assert.that(async () => {
          await repository.replayAggregate(aggregate);
        }).is.throwingAsync('Aggregate not found.');
      });

      test('applies previously saved events.', async () => {
        const started = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'started', {
          initiator: 'Jane Doe',
          destination: 'Riva',
          participants: []
        });
        const joined = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        started.metadata.revision = 1;
        joined.metadata.revision = 2;

        await eventStore.saveEvents({
          uncommittedEvents: [
            { event: started, state: {}},
            { event: joined, state: {}}
          ]
        });

        const aggregateReplayed = await repository.replayAggregate(aggregate);

        assert.that(aggregateReplayed.api.forReadOnly.state.initiator).is.equalTo('Jane Doe');
        assert.that(aggregateReplayed.api.forReadOnly.state.destination).is.equalTo('Riva');
        assert.that(aggregateReplayed.api.forReadOnly.state.participants).is.equalTo([ 'Jane Doe' ]);
      });

      test('applies previously saved snapshots and events.', async () => {
        const joinedFirst = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jenny Doe'
        });

        const joinedSecond = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        joinedFirst.metadata.revision = 100;
        joinedSecond.metadata.revision = 101;

        await eventStore.saveEvents({
          uncommittedEvents: [
            {
              event: joinedFirst,
              state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jenny Doe' ]}
            },
            {
              event: joinedSecond, state: {}
            }
          ]
        });

        const aggregateReplayed = await repository.replayAggregate(aggregate);

        assert.that(aggregateReplayed.api.forReadOnly.state.initiator).is.equalTo('Jane Doe');
        assert.that(aggregateReplayed.api.forReadOnly.state.destination).is.equalTo('Riva');
        assert.that(aggregateReplayed.api.forReadOnly.state.participants).is.equalTo([ 'Jenny Doe', 'Jane Doe' ]);
      });
    });

    suite('loadAggregate', () => {
      test('is a function.', async () => {
        assert.that(repository.loadAggregate).is.ofType('function');
      });

      test('throws an error if context is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregate({});
        }).is.throwingAsync('Context is missing.');
      });

      test('throws an error if context name is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregate({
            context: {}
          });
        }).is.throwingAsync('Context name is missing.');
      });

      test('throws an error if aggregate is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregate({
            context: { name: 'planning' }
          });
        }).is.throwingAsync('Aggregate is missing.');
      });

      test('throws an error if aggregate name is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregate({
            context: { name: 'planning' },
            aggregate: {}
          });
        }).is.throwingAsync('Aggregate name is missing.');
      });

      test('throws an error if aggregate id is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregate({
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup' }
          });
        }).is.throwingAsync('Aggregate id is missing.');
      });

      test('calls replayAggregate.', async () => {
        const aggregateId = uuid();

        let wasCalled = false;

        repository.replayAggregate = async function (aggregateReadable) {
          wasCalled = true;
          assert.that(aggregateReadable).is.instanceOf(app.ReadableAggregate);
          assert.that(aggregateReadable.instance.id).is.equalTo(aggregateId);
        };

        await repository.loadAggregate({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: aggregateId }
        });

        assert.that(wasCalled).is.true();
      });
    });

    suite('loadAggregateFor', () => {
      test('is a function.', async () => {
        assert.that(repository.loadAggregateFor).is.ofType('function');
      });

      test('throws an error if command is missing.', async () => {
        await assert.that(async () => {
          await repository.loadAggregateFor();
        }).is.throwingAsync('Command is missing.');
      });

      test('calls replayAggregate.', async () => {
        let wasCalled = false;

        repository.replayAggregate = async function (aggregateWritable) {
          wasCalled = true;
          assert.that(aggregateWritable).is.instanceOf(app.WritableAggregate);
          assert.that(aggregateWritable.instance.id).is.equalTo(command.aggregate.id);
        };

        await repository.loadAggregateFor(command);

        assert.that(wasCalled).is.true();
      });
    });
  });
});

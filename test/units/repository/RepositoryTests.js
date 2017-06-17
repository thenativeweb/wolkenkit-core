'use strict';

const path = require('path');

const _ = require('lodash'),
      assert = require('assertthat'),
      EventStore = require('sparbuch/lib/postgres/Sparbuch'),
      runfork = require('runfork'),
      tailwind = require('tailwind'),
      toArray = require('streamtoarray'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../helpers/buildCommand'),
      buildEvent = require('../../helpers/buildEvent'),
      env = require('../../helpers/env'),
      Repository = require('../../../repository/Repository');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', 'app')).writeModel;

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'keys', 'certificate.pem')
  }
});

suite('Repository', () => {
  const eventStore = new EventStore();

  suiteSetup(done => {
    eventStore.initialize({
      url: env.POSTGRES_URL_UNITS,
      namespace: 'testdomain'
    }, done);
  });

  suiteTeardown(() => {
    // We don't explicitly run eventStore.destroy() here, because it caused
    // strange problems on CircleCI. The tests hang in the teardown function.
    // This can be tracked down to disposing and destroying the internal pool
    // of knex, which is provided by pool2. We don't have an idea WHY it works
    // this way, but apparently it does.
  });

  setup(done => {
    runfork({
      path: path.join(__dirname, '..', '..', 'helpers', 'runResetPostgres.js'),
      env: {
        NAMESPACE: 'testdomain',
        URL: env.POSTGRES_URL_UNITS
      },
      onExit (exitCode) {
        if (exitCode > 0) {
          return done(new Error('Failed to reset PostgreSQL.'));
        }
        done(null);
      }
    }, errfork => {
      if (errfork) {
        return done(errfork);
      }
    });
  });

  test('is a function.', done => {
    assert.that(Repository).is.ofType('function');
    done();
  });

  suite('initialize', () => {
    let repository;

    setup(() => {
      repository = new Repository();
    });

    test('is a function.', done => {
      assert.that(repository.initialize).is.ofType('function');
      done();
    });

    test('throws an error if options are missing.', done => {
      assert.that(() => {
        repository.initialize();
      }).is.throwing('Options are missing.');
      done();
    });

    test('throws an error if app is missing.', done => {
      assert.that(() => {
        repository.initialize({});
      }).is.throwing('App is missing.');
      done();
    });

    test('throws an error if write model is missing.', done => {
      assert.that(() => {
        repository.initialize({ app });
      }).is.throwing('Write model is missing.');
      done();
    });

    test('throws an error if event store is missing.', done => {
      assert.that(() => {
        repository.initialize({ app, writeModel });
      }).is.throwing('Event store is missing.');
      done();
    });

    test('throws an error if callback is missing.', done => {
      assert.that(() => {
        repository.initialize({ app, writeModel, eventStore });
      }).is.throwing('Callback is missing.');
      done();
    });

    test('runs the callback.', done => {
      repository.initialize({ app, writeModel, eventStore }, err => {
        assert.that(err).is.null();
        done();
      });
    });
  });

  suite('instance', () => {
    let aggregate,
        command,
        repository;

    setup(done => {
      repository = new Repository();
      repository.initialize({ app, eventStore, writeModel }, err => {
        assert.that(err).is.null();

        const aggregateId = uuid();

        const token = { sub: uuid() };

        command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
          participant: 'Jane Doe'
        });

        command.addToken(token);

        aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: aggregateId },
          command
        });

        done();
      });
    });

    suite('saveAggregate', () => {
      test('is a function.', done => {
        assert.that(repository.saveAggregate).is.ofType('function');
        done();
      });

      test('throws an error if aggregate is missing.', done => {
        assert.that(() => {
          repository.saveAggregate();
        }).is.throwing('Aggregate is missing.');
        done();
      });

      test('throws an error if callback is missing.', done => {
        assert.that(() => {
          repository.saveAggregate(aggregate);
        }).is.throwing('Callback is missing.');
        done();
      });

      test('does nothing when there are no uncommitted events.', done => {
        repository.saveAggregate(aggregate, errSaveAggregate => {
          assert.that(errSaveAggregate).is.null();

          eventStore.getEventStream(aggregate.instance.id, (errGetEventStream, eventStream) => {
            assert.that(errGetEventStream).is.null();

            toArray(eventStream, (errToArray, events) => {
              assert.that(errToArray).is.null();
              assert.that(events.length).is.equalTo(0);
              done();
            });
          });
        });
      });

      test('saves a single uncommitted event to the event store.', done => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });

        repository.saveAggregate(aggregate, errSaveAggregate => {
          assert.that(errSaveAggregate).is.null();

          eventStore.getEventStream(aggregate.instance.id, (errGetEventStream, eventStream) => {
            assert.that(errGetEventStream).is.null();

            toArray(eventStream, (errToArray, events) => {
              assert.that(errToArray).is.null();
              assert.that(events.length).is.equalTo(1);
              assert.that(events[0].name).is.equalTo('started');
              assert.that(events[0].data).is.equalTo({ initiator: 'Jane Doe', destination: 'Riva' });
              done();
            });
          });
        });
      });

      test('saves multiple uncommitted events to the event store.', done => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });
        aggregate.api.forCommands.events.publish('joined', { participant: 'Jane Doe' });

        repository.saveAggregate(aggregate, errSaveAggregate => {
          assert.that(errSaveAggregate).is.null();

          eventStore.getEventStream(aggregate.instance.id, (errGetEventStream, eventStream) => {
            assert.that(errGetEventStream).is.null();

            toArray(eventStream, (errToArray, events) => {
              assert.that(errToArray).is.null();
              assert.that(events.length).is.equalTo(2);
              assert.that(events[0].name).is.equalTo('started');
              assert.that(events[0].data).is.equalTo({ initiator: 'Jane Doe', destination: 'Riva' });
              assert.that(events[1].name).is.equalTo('joined');
              assert.that(events[1].data).is.equalTo({ participant: 'Jane Doe' });
              done();
            });
          });
        });
      });

      test('returns the committed events from the event store.', done => {
        aggregate.api.forCommands.events.publish('started', { initiator: 'Jane Doe', destination: 'Riva' });
        aggregate.api.forCommands.events.publish('joined', { participant: 'Jane Doe' });

        repository.saveAggregate(aggregate, (err, committedEvents) => {
          assert.that(err).is.null();

          assert.that(committedEvents.length).is.equalTo(2);
          assert.that(committedEvents[0].metadata.position).is.ofType('number');
          assert.that(committedEvents[1].metadata.position).is.ofType('number');
          assert.that(committedEvents[0].metadata.position + 1).is.equalTo(committedEvents[1].metadata.position);
          done();
        });
      });
    });

    suite('saveSnapshotFor', () => {
      test('is a function.', done => {
        assert.that(repository.saveSnapshotFor).is.ofType('function');
        done();
      });

      test('throws an error if aggregate is missing.', done => {
        assert.that(() => {
          repository.saveSnapshotFor();
        }).is.throwing('Aggregate is missing.');
        done();
      });

      test('throws an error if callback is missing.', done => {
        assert.that(() => {
          repository.saveSnapshotFor(aggregate);
        }).is.throwing('Callback is missing.');
        done();
      });

      test('saves a snapshot from the given aggregate.', done => {
        aggregate.instance.revision = 23;
        aggregate.api.forEvents.setState({
          initiator: 'Jane Doe',
          destination: 'Riva'
        });

        repository.saveSnapshotFor(aggregate, errSaveSnapshotFor => {
          assert.that(errSaveSnapshotFor).is.null();

          eventStore.getSnapshot(aggregate.instance.id, (errGetSnapshot, snapshot) => {
            assert.that(errGetSnapshot).is.null();

            // The PostgreSQL driver does not return fields that contain the
            // value undefined. Hence, we need to remove the owner from the
            // aggregate to ensure that both are considered equal.
            Reflect.deleteProperty(aggregate.api.forReadOnly.state.isAuthorized, 'owner');

            assert.that(snapshot).is.equalTo({
              revision: 23,
              state: aggregate.api.forReadOnly.state
            });
            done();
          });
        });
      });
    });

    suite('replayAggregate', () => {
      test('is a function.', done => {
        assert.that(repository.replayAggregate).is.ofType('function');
        done();
      });

      test('throws an error if aggregate is missing.', done => {
        assert.that(() => {
          repository.replayAggregate();
        }).is.throwing('Aggregate is missing.');
        done();
      });

      test('throws an error if callback is missing.', done => {
        assert.that(() => {
          repository.replayAggregate(aggregate);
        }).is.throwing('Callback is missing.');
        done();
      });

      test('returns the aggregate as-is if no events have been saved.', done => {
        const oldState = _.cloneDeep(aggregate.api.forReadOnly.state);

        repository.replayAggregate(aggregate, (err, aggregateReplayed) => {
          assert.that(err).is.null();
          assert.that(aggregateReplayed.api.forReadOnly.state).is.equalTo(oldState);
          done();
        });
      });

      test('applies previously saved events.', done => {
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

        eventStore.saveEvents({
          events: [ started, joined ]
        }, errSaveEvents => {
          assert.that(errSaveEvents).is.null();

          repository.replayAggregate(aggregate, (errReplayAggregate, aggregateReplayed) => {
            assert.that(errReplayAggregate).is.null();
            assert.that(aggregateReplayed.api.forReadOnly.state.initiator).is.equalTo('Jane Doe');
            assert.that(aggregateReplayed.api.forReadOnly.state.destination).is.equalTo('Riva');
            assert.that(aggregateReplayed.api.forReadOnly.state.participants).is.equalTo([ 'Jane Doe' ]);
            done();
          });
        });
      });

      test('applies previously saved snapshots and events.', done => {
        const snapshot = {
          aggregateId: aggregate.instance.id,
          state: { initiator: 'Jane Doe', destination: 'Riva', participants: []},
          revision: 100
        };

        const joined = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        joined.metadata.revision = 101;

        eventStore.saveSnapshot(snapshot, errSaveSnapshot => {
          assert.that(errSaveSnapshot).is.null();

          eventStore.saveEvents({
            events: [ joined ]
          }, errSaveEvents => {
            assert.that(errSaveEvents).is.null();

            repository.replayAggregate(aggregate, (errReplayAggregate, aggregateReplayed) => {
              assert.that(errReplayAggregate).is.null();
              assert.that(aggregateReplayed.api.forReadOnly.state.initiator).is.equalTo('Jane Doe');
              assert.that(aggregateReplayed.api.forReadOnly.state.destination).is.equalTo('Riva');
              assert.that(aggregateReplayed.api.forReadOnly.state.participants).is.equalTo([ 'Jane Doe' ]);
              done();
            });
          });
        });
      });

      test('does not save a snapshot when only a few events were replayed.', done => {
        const started = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'started', {
          participant: 'Jane Doe'
        });
        const joined = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        started.metadata.revision = 1;
        joined.metadata.revision = 2;

        eventStore.saveEvents({
          events: [ started, joined ]
        }, errSaveEvents => {
          assert.that(errSaveEvents).is.null();

          repository.saveSnapshotFor = () => {
            throw new Error('Invalid operation.');
          };

          repository.replayAggregate(aggregate, errReplayAggregate => {
            assert.that(errReplayAggregate).is.null();
            done();
          });
        });
      });

      test('saves a snapshot when lots of events were replayed.', done => {
        const started = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'started', {
          participant: 'Jane Doe'
        });
        const joined = buildEvent('planning', 'peerGroup', aggregate.instance.id, 'joined', {
          participant: 'Jane Doe'
        });

        started.metadata.revision = 1;
        joined.metadata.revision = started.metadata.revision + 100;

        eventStore.saveEvents({
          events: [ started, joined ]
        }, errSaveEvents => {
          assert.that(errSaveEvents).is.null();

          repository.saveSnapshotFor = function (aggregateForSnapshot) {
            assert.that(aggregateForSnapshot.instance.id).is.equalTo(aggregate.instance.id);
            done();
          };

          repository.replayAggregate(aggregate, () => {
            // Intentionally left blank.
          });
        });
      });
    });

    suite('loadAggregate', () => {
      test('is a function.', done => {
        assert.that(repository.loadAggregate).is.ofType('function');
        done();
      });

      test('throws an error if options are missing.', done => {
        assert.that(() => {
          repository.loadAggregate();
        }).is.throwing('Options are missing.');
        done();
      });

      test('throws an error if context is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({});
        }).is.throwing('Context is missing.');
        done();
      });

      test('throws an error if context name is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({
            context: {}
          });
        }).is.throwing('Context name is missing.');
        done();
      });

      test('throws an error if aggregate is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({
            context: { name: 'planning' }
          });
        }).is.throwing('Aggregate is missing.');
        done();
      });

      test('throws an error if aggregate name is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({
            context: { name: 'planning' },
            aggregate: {}
          });
        }).is.throwing('Aggregate name is missing.');
        done();
      });

      test('throws an error if aggregate id is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup' }
          });
        }).is.throwing('Aggregate id is missing.');
        done();
      });

      test('throws an error if callback is missing.', done => {
        assert.that(() => {
          repository.loadAggregate({
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: uuid() }
          });
        }).is.throwing('Callback is missing.');
        done();
      });

      test('calls replayAggregate.', done => {
        const aggregateId = uuid();

        let hasReplayAggregateBeenCalled = false;

        repository.replayAggregate = function (aggregateReadable, callback) {
          hasReplayAggregateBeenCalled = true;
          assert.that(aggregateReadable).is.instanceOf(Aggregate.Readable);
          assert.that(aggregateReadable.instance.id).is.equalTo(aggregateId);
          callback(null);
        };

        repository.loadAggregate({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: aggregateId }
        }, err => {
          assert.that(err).is.null();
          assert.that(hasReplayAggregateBeenCalled).is.true();
          done();
        });
      });
    });

    suite('loadAggregateFor', () => {
      test('is a function.', done => {
        assert.that(repository.loadAggregateFor).is.ofType('function');
        done();
      });

      test('throws an error if command is missing.', done => {
        assert.that(() => {
          repository.loadAggregateFor();
        }).is.throwing('Command is missing.');
        done();
      });

      test('throws an error if callback is missing.', done => {
        assert.that(() => {
          repository.loadAggregateFor(command);
        }).is.throwing('Callback is missing.');
        done();
      });

      test('calls replayAggregate.', done => {
        let hasReplayAggregateBeenCalled = false;

        repository.replayAggregate = function (aggregateWritable, callback) {
          hasReplayAggregateBeenCalled = true;
          assert.that(aggregateWritable).is.instanceOf(Aggregate.Writable);
          assert.that(aggregateWritable.instance.id).is.equalTo(command.aggregate.id);
          callback(null);
        };

        repository.loadAggregateFor(command, err => {
          assert.that(err).is.null();
          assert.that(hasReplayAggregateBeenCalled).is.true();
          done();
        });
      });
    });
  });
});

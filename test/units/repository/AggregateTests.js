'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../shared/buildCommand');

suite('Aggregate', () => {
  let writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', 'app')
    })).writeModel;
  });

  suite('Readable', () => {
    test('is a function.', async () => {
      assert.that(Aggregate.Readable).is.ofType('function');
    });

    test('throws an error if write model is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({});
        /* eslint-enable no-new */
      }).is.throwing('Write model is missing.');
    });

    test('throws an error if context is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({ writeModel });
        /* eslint-enable no-new */
      }).is.throwing('Context is missing.');
    });

    test('throws an error if context name is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: {}
        });
        /* eslint-enable no-new */
      }).is.throwing('Context name is missing.');
    });

    test('throws an error if aggregate is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate is missing.');
    });

    test('throws an error if aggregate name is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: {}
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate name is missing.');
    });

    test('throws an error if aggregate id is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate id is missing.');
    });

    test('throws an error if context does not exist.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'non-existent' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });
        /* eslint-enable no-new */
      }).is.throwing('Context does not exist.');
    });

    test('throws an error if aggregate does not exist.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'non-existent', id: uuid() }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate does not exist.');
    });

    suite('definition', () => {
      test('contains the appropriate aggregate definition from the write model.', async () => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(aggregate.definition).is.ofType('object');
        assert.that(aggregate.definition.initialState.participants).is.equalTo([]);
        assert.that(aggregate.definition.commands.start).is.ofType('object');
        assert.that(aggregate.definition.commands.start.isAuthorized).is.ofType('function');
        assert.that(aggregate.definition.commands.start.handle).is.ofType('function');
        assert.that(aggregate.definition.commands.join).is.ofType('object');
        assert.that(aggregate.definition.commands.join.isAuthorized).is.ofType('function');
        assert.that(aggregate.definition.commands.join.handle).is.ofType('function');
        assert.that(aggregate.definition.events.started).is.ofType('function');
        assert.that(aggregate.definition.events.joined).is.ofType('function');
      });
    });

    suite('instance', () => {
      suite('id', () => {
        test('contains the requested aggregate\'s id.', async () => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.id).is.equalTo(aggregateId);
        });
      });

      suite('revision', () => {
        test('is 0.', async () => {
          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: uuid() }
          });

          assert.that(aggregate.instance.revision).is.equalTo(0);
        });
      });

      suite('uncommitted events', () => {
        test('is an empty array.', async () => {
          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: uuid() }
          });

          assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);
        });
      });

      suite('exists', () => {
        test('is a function.', async () => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.exists).is.ofType('function');
        });

        test('returns false if revision is 0.', async () => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.exists()).is.false();
        });

        test('returns true if revision is greater than 0.', async () => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          const snapshot = {
            state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jane Doe' ]},
            revision: 23
          };

          aggregate.applySnapshot(snapshot);

          assert.that(aggregate.instance.exists()).is.true();
        });
      });
    });

    suite('api', () => {
      suite('forReadOnly', () => {
        test('contains the aggregate id.', async () => {
          const id = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id }
          });

          assert.that(aggregate.api.forReadOnly.id).is.equalTo(id);
        });

        suite('state', () => {
          test('contains the initial state.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forReadOnly.state).is.equalTo(writeModel.planning.peerGroup.initialState);
          });

          test('is a deep copy.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forReadOnly.state).is.not.sameAs(writeModel.planning.peerGroup.initialState);
          });
        });

        suite('exists', () => {
          test('references the instance exists function.', async () => {
            const aggregateId = uuid();

            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId }
            });

            assert.that(aggregate.api.forReadOnly.exists).is.sameAs(aggregate.instance.exists);
          });
        });
      });

      suite('forEvents', () => {
        test('contains the aggregate id.', async () => {
          const id = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id }
          });

          assert.that(aggregate.api.forEvents.id).is.equalTo(id);
        });

        suite('state', () => {
          test('references the read-only api state.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
          });
        });

        suite('setState', () => {
          test('is a function.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forEvents.setState).is.ofType('function');
          });

          test('updates the state.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forEvents.state.initiator).is.undefined();
            assert.that(aggregate.api.forEvents.state.destination).is.undefined();
            assert.that(aggregate.api.forEvents.state.participants).is.equalTo([]);

            aggregate.api.forEvents.setState({
              initiator: 'Jane Doe',
              participants: [ 'Jane Doe' ]
            });

            assert.that(aggregate.api.forEvents.state.initiator).is.equalTo('Jane Doe');
            assert.that(aggregate.api.forEvents.state.destination).is.undefined();
            assert.that(aggregate.api.forEvents.state.participants).is.equalTo([ 'Jane Doe' ]);
          });

          test('correctly resets arrays.', async () => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            aggregate.api.forEvents.setState({
              initiator: 'Jane Doe',
              participants: [ 'Jane Doe' ]
            });

            aggregate.api.forEvents.setState({
              participants: []
            });

            assert.that(aggregate.api.forEvents.state.initiator).is.equalTo('Jane Doe');
            assert.that(aggregate.api.forEvents.state.destination).is.undefined();
            assert.that(aggregate.api.forEvents.state.participants).is.equalTo([]);
          });
        });
      });
    });

    suite('applySnapshot', () => {
      test('is a function.', async () => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(aggregate.applySnapshot).is.ofType('function');
      });

      test('throws an error if snapshot is missing.', async () => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(() => {
          aggregate.applySnapshot();
        }).is.throwing('Snapshot is missing.');
      });

      test('overwrites the revision.', async () => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        const snapshot = {
          state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jane Doe' ]},
          revision: 23
        };

        aggregate.applySnapshot(snapshot);

        assert.that(aggregate.instance.revision).is.equalTo(23);
      });

      test('overwrites the state.', async () => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        const snapshot = {
          state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jane Doe' ]},
          revision: 23
        };

        aggregate.applySnapshot(snapshot);

        assert.that(aggregate.api.forReadOnly.state).is.equalTo(snapshot.state);
        assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
      });
    });
  });

  suite('Writable', () => {
    let app;

    setup(() => {
      app = tailwind.createApp({
        keys: path.join(__dirname, 'shared', 'keys'),
        identityProvider: {
          name: 'auth.wolkenkit.io',
          certificate: path.join(__dirname, '..', '..', 'shared', 'keys', 'certificate.pem')
        }
      });
    });

    test('is a function.', async () => {
      assert.that(Aggregate.Writable).is.ofType('function');
    });

    test('throws an error if app is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({});
        /* eslint-enable no-new */
      }).is.throwing('App is missing.');
    });

    test('throws an error if write model is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app });
        /* eslint-enable no-new */
      }).is.throwing('Write model is missing.');
    });

    test('throws an error if context is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app, writeModel });
        /* eslint-enable no-new */
      }).is.throwing('Context is missing.');
    });

    test('throws an error if context name is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app, writeModel, context: {}});
        /* eslint-enable no-new */
      }).is.throwing('Context name is missing.');
    });

    test('throws an error if aggregate is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate is missing.');
    });

    test('throws an error if aggregate name is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: {}
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate name is missing.');
    });

    test('throws an error if aggregate id is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate id is missing.');
    });

    test('throws an error if command is missing.', async () => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });
        /* eslint-enable no-new */
      }).is.throwing('Command is missing.');
    });

    test('derives from Readable.', async () => {
      const aggregateId = uuid();

      const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
        participant: 'Jane Doe'
      });

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        command
      });

      assert.that(aggregate.definition).is.ofType('object');
      assert.that(aggregate.definition.initialState.participants).is.equalTo([]);
      assert.that(aggregate.definition.commands.start).is.ofType('object');
      assert.that(aggregate.definition.commands.start.isAuthorized).is.ofType('function');
      assert.that(aggregate.definition.commands.start.handle).is.ofType('function');
      assert.that(aggregate.definition.commands.join).is.ofType('object');
      assert.that(aggregate.definition.commands.join.isAuthorized).is.ofType('function');
      assert.that(aggregate.definition.commands.join.handle).is.ofType('function');
      assert.that(aggregate.definition.events.started).is.ofType('function');
      assert.that(aggregate.definition.events.joined).is.ofType('function');

      assert.that(aggregate.instance.id).is.equalTo(aggregateId);
      assert.that(aggregate.instance.revision).is.equalTo(0);
      assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);

      assert.that(aggregate.api.forReadOnly.id).is.equalTo(aggregateId);
      assert.that(aggregate.api.forReadOnly.state).is.equalTo(writeModel.planning.peerGroup.initialState);
      assert.that(aggregate.api.forEvents.id).is.sameAs(aggregate.api.forReadOnly.id);
      assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
      assert.that(aggregate.api.forEvents.setState).is.ofType('function');

      assert.that(aggregate.applySnapshot).is.ofType('function');
    });

    suite('api', () => {
      suite('forCommands', () => {
        test('contains the aggregate id.', async () => {
          const aggregateId = uuid();

          const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
            participant: 'Jane Doe'
          });

          const aggregate = new Aggregate.Writable({
            app,
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId },
            command
          });

          assert.that(aggregate.api.forCommands.id).is.equalTo(aggregateId);
        });

        suite('state', () => {
          test('references the read-only api state.', async () => {
            const aggregateId = uuid();

            const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
              participant: 'Jane Doe'
            });

            const aggregate = new Aggregate.Writable({
              app,
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId },
              command
            });

            assert.that(aggregate.api.forCommands.state).is.sameAs(aggregate.api.forReadOnly.state);
          });
        });

        suite('exists', () => {
          test('references the instance exists function.', async () => {
            const aggregateId = uuid();

            const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
              participant: 'Jane Doe'
            });

            const aggregate = new Aggregate.Writable({
              app,
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId },
              command
            });

            assert.that(aggregate.api.forCommands.exists).is.sameAs(aggregate.instance.exists);
          });
        });

        suite('events', () => {
          suite('publish', () => {
            test('is a function.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              assert.that(aggregate.api.forCommands.events.publish).is.ofType('function');
            });

            test('throws an error if name is missing.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              assert.that(() => {
                aggregate.api.forCommands.events.publish();
              }).is.throwing('Event name is missing.');
            });

            test('throws an error if a non-existent name is given.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              assert.that(() => {
                aggregate.api.forCommands.events.publish('non-existent');
              }).is.throwing('Unknown event.');
            });

            test('does not throw an error if data is missing.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              command.addToken({
                sub: '6db3ef6a-a607-40cc-8108-65e81816b320'
              });

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              assert.that(() => {
                aggregate.api.forCommands.events.publish('joined');
              }).is.not.throwing();
            });

            test('creates a new event and adds it to the list of uncommitted events.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const token = { sub: '6db3ef6a-a607-40cc-8108-65e81816b320' };

              command.addToken(token);

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'Jane Doe'
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'John Doe'
              });

              assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(2);
              assert.that(aggregate.instance.uncommittedEvents[0].context.name).is.equalTo('planning');
              assert.that(aggregate.instance.uncommittedEvents[0].aggregate.name).is.equalTo('peerGroup');
              assert.that(aggregate.instance.uncommittedEvents[0].aggregate.id).is.equalTo(aggregateId);
              assert.that(aggregate.instance.uncommittedEvents[0].name).is.equalTo('joined');
              assert.that(aggregate.instance.uncommittedEvents[0].data).is.equalTo({
                participant: 'Jane Doe'
              });
              assert.that(aggregate.instance.uncommittedEvents[0].user.id).is.equalTo(token.sub);
              assert.that(aggregate.instance.uncommittedEvents[0].metadata.revision).is.equalTo(1);

              assert.that(aggregate.instance.uncommittedEvents[1].context.name).is.equalTo('planning');
              assert.that(aggregate.instance.uncommittedEvents[1].aggregate.name).is.equalTo('peerGroup');
              assert.that(aggregate.instance.uncommittedEvents[1].aggregate.id).is.equalTo(aggregateId);
              assert.that(aggregate.instance.uncommittedEvents[1].name).is.equalTo('joined');
              assert.that(aggregate.instance.uncommittedEvents[1].data).is.equalTo({
                participant: 'John Doe'
              });
              assert.that(aggregate.instance.uncommittedEvents[1].user.id).is.equalTo(token.sub);
              assert.that(aggregate.instance.uncommittedEvents[1].metadata.revision).is.equalTo(2);
            });

            test('sets the correlation and the causation id of the new event.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const token = { sub: '6db3ef6a-a607-40cc-8108-65e81816b320' };

              command.addToken(token);

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'Jane Doe'
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'John Doe'
              });

              assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(2);
              assert.that(aggregate.instance.uncommittedEvents[0].metadata.correlationId).is.equalTo(command.metadata.correlationId);
              assert.that(aggregate.instance.uncommittedEvents[0].metadata.causationId).is.equalTo(command.id);
              assert.that(aggregate.instance.uncommittedEvents[1].metadata.correlationId).is.equalTo(command.metadata.correlationId);
              assert.that(aggregate.instance.uncommittedEvents[1].metadata.causationId).is.equalTo(command.id);
            });

            test('does not increase the aggregate revision.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const token = { sub: '6db3ef6a-a607-40cc-8108-65e81816b320' };

              command.addToken(token);

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'Jane Doe'
              });

              assert.that(aggregate.instance.revision).is.equalTo(0);
            });

            test('updates the aggregate state.', async () => {
              const aggregateId = uuid();

              const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                participant: 'Jane Doe'
              });

              const token = { sub: '6db3ef6a-a607-40cc-8108-65e81816b320' };

              command.addToken(token);

              const aggregate = new Aggregate.Writable({
                app,
                writeModel,
                context: { name: 'planning' },
                aggregate: { name: 'peerGroup', id: aggregateId },
                command
              });

              aggregate.api.forCommands.events.publish('joined', {
                participant: 'Jane Doe'
              });

              assert.that(aggregate.api.forCommands.state.participants).is.equalTo([ 'Jane Doe' ]);
            });
          });
        });
      });
    });

    suite('applySnapshot', () => {
      test('is a function.', async () => {
        const aggregateId = uuid();

        const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
          participant: 'Jane Doe'
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          command
        });

        assert.that(aggregate.applySnapshot).is.ofType('function');
      });

      test('throws an error if snapshot is missing.', async () => {
        const aggregateId = uuid();

        const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
          participant: 'Jane Doe'
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          command
        });

        assert.that(() => {
          aggregate.applySnapshot();
        }).is.throwing('Snapshot is missing.');
      });

      test('overwrites the revision.', async () => {
        const aggregateId = uuid();

        const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
          participant: 'Jane Doe'
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          command
        });

        const snapshot = {
          state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jane Doe' ]},
          revision: 23
        };

        aggregate.applySnapshot(snapshot);

        assert.that(aggregate.instance.revision).is.equalTo(23);
      });

      test('overwrites the state.', async () => {
        const aggregateId = uuid();

        const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
          participant: 'Jane Doe'
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          command
        });

        const snapshot = {
          state: { initiator: 'Jane Doe', destination: 'Riva', participants: [ 'Jane Doe' ]},
          evision: 23
        };

        aggregate.applySnapshot(snapshot);

        assert.that(aggregate.api.forReadOnly.state).is.equalTo(snapshot.state);
        assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
        assert.that(aggregate.api.forCommands.state).is.sameAs(aggregate.api.forReadOnly.state);
      });
    });
  });
});

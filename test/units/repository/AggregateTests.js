'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../helpers/buildCommand');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', 'app')).writeModel;

suite('Aggregate', () => {
  suite('Readable', () => {
    test('is a function.', done => {
      assert.that(Aggregate.Readable).is.ofType('function');
      done();
    });

    test('throws an error if options are missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable();
        /* eslint-enable no-new */
      }).is.throwing('Options are missing.');
      done();
    });

    test('throws an error if write model is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({});
        /* eslint-enable no-new */
      }).is.throwing('Write model is missing.');
      done();
    });

    test('throws an error if context is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({ writeModel });
        /* eslint-enable no-new */
      }).is.throwing('Context is missing.');
      done();
    });

    test('throws an error if context name is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: {}
        });
        /* eslint-enable no-new */
      }).is.throwing('Context name is missing.');
      done();
    });

    test('throws an error if aggregate is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate is missing.');
      done();
    });

    test('throws an error if aggregate name is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: {}
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate name is missing.');
      done();
    });

    test('throws an error if aggregate id is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate id is missing.');
      done();
    });

    test('throws an error if context does not exist.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'non-existent' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });
        /* eslint-enable no-new */
      }).is.throwing('Context does not exist.');
      done();
    });

    test('throws an error if aggregate does not exist.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'non-existent', id: uuid() }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate does not exist.');
      done();
    });

    suite('definition', () => {
      test('contains the appropriate aggregate definition from the write model.', done => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(aggregate.definition).is.ofType('object');
        assert.that(aggregate.definition.initialState.participants).is.equalTo([]);
        assert.that(aggregate.definition.commands.start).is.ofType('array');
        assert.that(aggregate.definition.commands.join).is.ofType('array');
        assert.that(aggregate.definition.events.started).is.ofType('function');
        assert.that(aggregate.definition.events.joined).is.ofType('function');
        done();
      });
    });

    suite('instance', () => {
      suite('id', () => {
        test('contains the requested aggregate\'s id.', done => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.id).is.equalTo(aggregateId);
          done();
        });
      });

      suite('revision', () => {
        test('is 0.', done => {
          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: uuid() }
          });

          assert.that(aggregate.instance.revision).is.equalTo(0);
          done();
        });
      });

      suite('uncommitted events', () => {
        test('is an empty array.', done => {
          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: uuid() }
          });

          assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);
          done();
        });
      });

      suite('exists', () => {
        test('is a function.', done => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.exists).is.ofType('function');
          done();
        });

        test('returns false if revision is 0.', done => {
          const aggregateId = uuid();

          const aggregate = new Aggregate.Readable({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: aggregateId }
          });

          assert.that(aggregate.instance.exists()).is.false();
          done();
        });

        test('returns true if revision is greater than 0.', done => {
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
          done();
        });
      });
    });

    suite('api', () => {
      suite('forReadOnly', () => {
        suite('state', () => {
          test('contains the initial state.', done => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forReadOnly.state).is.equalTo(writeModel.planning.peerGroup.initialState);
            done();
          });

          test('is a deep copy.', done => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forReadOnly.state).is.not.sameAs(writeModel.planning.peerGroup.initialState);
            done();
          });
        });

        suite('exists', () => {
          test('references the instance exists function.', done => {
            const aggregateId = uuid();

            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId }
            });

            assert.that(aggregate.api.forReadOnly.exists).is.sameAs(aggregate.instance.exists);
            done();
          });
        });
      });

      suite('forEvents', () => {
        suite('state', () => {
          test('references the read-only api state.', done => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
            done();
          });
        });

        suite('setState', () => {
          test('is a function.', done => {
            const aggregate = new Aggregate.Readable({
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: uuid() }
            });

            assert.that(aggregate.api.forEvents.setState).is.ofType('function');
            done();
          });

          test('updates the state.', done => {
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
            done();
          });
        });
      });
    });

    suite('applySnapshot', () => {
      test('is a function.', done => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(aggregate.applySnapshot).is.ofType('function');
        done();
      });

      test('throws an error if snapshot is missing.', done => {
        const aggregate = new Aggregate.Readable({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() }
        });

        assert.that(() => {
          aggregate.applySnapshot();
        }).is.throwing('Snapshot is missing.');
        done();
      });

      test('overwrites the revision.', done => {
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
        done();
      });

      test('overwrites the state.', done => {
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
        done();
      });
    });
  });

  suite('Writable', () => {
    let app;

    setup(() => {
      app = tailwind.createApp({
        keys: path.join(__dirname, 'keys'),
        identityProvider: {
          name: 'auth.wolkenkit.io',
          certificate: path.join(__dirname, '..', '..', 'keys', 'certificate.pem')
        }
      });
    });

    test('is a function.', done => {
      assert.that(Aggregate.Writable).is.ofType('function');
      done();
    });

    test('throws an error if options are missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable();
        /* eslint-enable no-new */
      }).is.throwing('Options are missing.');
      done();
    });

    test('throws an error if app is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({});
        /* eslint-enable no-new */
      }).is.throwing('App is missing.');
      done();
    });

    test('throws an error if write model is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app });
        /* eslint-enable no-new */
      }).is.throwing('Write model is missing.');
      done();
    });

    test('throws an error if context is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app, writeModel });
        /* eslint-enable no-new */
      }).is.throwing('Context is missing.');
      done();
    });

    test('throws an error if context name is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({ app, writeModel, context: {}});
        /* eslint-enable no-new */
      }).is.throwing('Context name is missing.');
      done();
    });

    test('throws an error if aggregate is missing.', done => {
      assert.that(() => {
        /* eslint-disable no-new */
        new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' }
        });
        /* eslint-enable no-new */
      }).is.throwing('Aggregate is missing.');
      done();
    });

    test('throws an error if aggregate name is missing.', done => {
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
      done();
    });

    test('throws an error if aggregate id is missing.', done => {
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
      done();
    });

    test('throws an error if command is missing.', done => {
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
      done();
    });

    test('derives from Readable.', done => {
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
      assert.that(aggregate.definition.commands.start).is.ofType('array');
      assert.that(aggregate.definition.commands.join).is.ofType('array');
      assert.that(aggregate.definition.events.started).is.ofType('function');
      assert.that(aggregate.definition.events.joined).is.ofType('function');

      assert.that(aggregate.instance.id).is.equalTo(aggregateId);
      assert.that(aggregate.instance.revision).is.equalTo(0);
      assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);

      assert.that(aggregate.api.forReadOnly.state).is.equalTo(writeModel.planning.peerGroup.initialState);
      assert.that(aggregate.api.forEvents.state).is.sameAs(aggregate.api.forReadOnly.state);
      assert.that(aggregate.api.forEvents.setState).is.ofType('function');

      assert.that(aggregate.applySnapshot).is.ofType('function');
      done();
    });

    suite('api', () => {
      suite('forCommands', () => {
        suite('state', () => {
          test('references the read-only api state.', done => {
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
            done();
          });
        });

        suite('exists', () => {
          test('references the instance exists function.', done => {
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
            done();
          });
        });

        suite('events', () => {
          suite('publish', () => {
            test('is a function.', done => {
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
              done();
            });

            test('throws an error if name is missing.', done => {
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
              done();
            });

            test('throws an error if a non-existent name is given.', done => {
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
              done();
            });

            test('does not throw an error if data is missing.', done => {
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
              done();
            });

            test('creates a new event and adds it to the list of uncommitted events.', done => {
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
              done();
            });

            test('sets the correlation and the causation id of the new event.', done => {
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
              done();
            });

            suite('creates a new event and adds authorization metadata', () => {
              test('using the aggregate owner.', done => {
                const aggregateId = uuid();
                const ownerId = uuid();

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

                aggregate.api.forEvents.setState({
                  isAuthorized: { owner: ownerId }
                });

                aggregate.api.forCommands.events.publish('joined', {
                  participant: 'Jane Doe'
                });

                assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
                assert.that(aggregate.instance.uncommittedEvents[0].metadata.isAuthorized).is.equalTo({
                  owner: ownerId,
                  forAuthenticated: false,
                  forPublic: true
                });
                done();
              });

              test('using the user that sent the command if no aggregate owner is set.', done => {
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

                assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
                assert.that(aggregate.instance.uncommittedEvents[0].metadata.isAuthorized).is.equalTo({
                  owner: command.user.id,
                  forAuthenticated: false,
                  forPublic: true
                });
                done();
              });

              test('using anonymous if the command was sent anonymously and no aggregate owner is set.', done => {
                const aggregateId = uuid();

                const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
                  participant: 'Jane Doe'
                });

                command.addToken({
                  sub: 'anonymous'
                });

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

                assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
                assert.that(aggregate.instance.uncommittedEvents[0].metadata.isAuthorized).is.equalTo({
                  owner: 'anonymous',
                  forAuthenticated: false,
                  forPublic: true
                });
                done();
              });
            });

            test('does not increase the aggregate revision.', done => {
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
              done();
            });

            test('updates the aggregate state.', done => {
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
              done();
            });
          });
        });

        suite('transferOwnership', () => {
          test('is a function.', done => {
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

            assert.that(aggregate.api.forCommands.transferOwnership).is.ofType('function');
            done();
          });

          test('throws an error if data is missing.', done => {
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
              aggregate.api.forCommands.transferOwnership();
            }).is.throwing('Data is missing.');
            done();
          });

          test('throws an error if new owner is missing.', done => {
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
              aggregate.api.forCommands.transferOwnership({});
            }).is.throwing('Owner is missing.');
            done();
          });

          test('throws an error if new owner is the current owner.', done => {
            const aggregateId = uuid(),
                  currentOwnerId = uuid();

            const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
              participant: 'Jane Doe'
            });

            command.addToken({ sub: currentOwnerId });

            const aggregate = new Aggregate.Writable({
              app,
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId },
              command
            });

            aggregate.api.forEvents.setState({
              isAuthorized: { owner: currentOwnerId }
            });

            assert.that(() => {
              aggregate.api.forCommands.transferOwnership({
                to: currentOwnerId
              });
            }).is.throwing('Could not transfer ownership to current owner.');
            done();
          });

          test('publishes a transferredOwnership event.', done => {
            const aggregateId = uuid(),
                  currentOwnerId = uuid(),
                  newOwnerId = uuid();

            const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
              participant: 'Jane Doe'
            });

            command.addToken({ sub: currentOwnerId });

            const aggregate = new Aggregate.Writable({
              app,
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId },
              command
            });

            aggregate.api.forEvents.setState({
              isAuthorized: { owner: currentOwnerId }
            });

            aggregate.api.forCommands.transferOwnership({
              to: newOwnerId
            });

            assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
            assert.that(aggregate.instance.uncommittedEvents[0].context.name).is.equalTo('planning');
            assert.that(aggregate.instance.uncommittedEvents[0].aggregate.name).is.equalTo('peerGroup');
            assert.that(aggregate.instance.uncommittedEvents[0].aggregate.id).is.equalTo(aggregateId);
            assert.that(aggregate.instance.uncommittedEvents[0].name).is.equalTo('transferredOwnership');
            assert.that(aggregate.instance.uncommittedEvents[0].data).is.equalTo({
              from: currentOwnerId,
              to: newOwnerId
            });
            done();
          });
        });

        suite('authorize', () => {
          test('is a function.', done => {
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

            assert.that(aggregate.api.forCommands.authorize).is.ofType('function');
            done();
          });

          test('throws an error if data is missing.', done => {
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
              aggregate.api.forCommands.authorize();
            }).is.throwing('Data is missing.');
            done();
          });

          test('throws an error if commands and events are missing.', done => {
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
              aggregate.api.forCommands.authorize({});
            }).is.throwing('Commands and events are missing.');
            done();
          });

          test('throws an error if an unknown command is given.', done => {
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
              aggregate.api.forCommands.authorize({
                commands: {
                  unknownCommand: {}
                }
              });
            }).is.throwing('Unknown command.');
            done();
          });

          test('throws an error if an unknown event is given.', done => {
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
              aggregate.api.forCommands.authorize({
                events: {
                  unknownEvent: {}
                }
              });
            }).is.throwing('Unknown event.');
            done();
          });

          test('throws an error if no commands are given.', done => {
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
              aggregate.api.forCommands.authorize({
                commands: {}
              });
            }).is.throwing('Command is missing.');
            done();
          });

          test('throws an error if authorization options for command are missing.', done => {
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
              aggregate.api.forCommands.authorize({
                commands: {
                  join: {}
                }
              });
            }).is.throwing('Missing authorization options.');
            done();
          });

          test('throws an error if authorization options for event are missing.', done => {
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
              aggregate.api.forCommands.authorize({
                events: {
                  joined: {}
                }
              });
            }).is.throwing('Missing authorization options.');
            done();
          });

          test('throws an error if authorization options for command are non-boolean.', done => {
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
              aggregate.api.forCommands.authorize({
                commands: {
                  join: { forAuthenticated: 'true' }
                }
              });
            }).is.throwing('Invalid authorization option.');
            done();
          });

          test('throws an error if authorization options for event are non-boolean.', done => {
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
              aggregate.api.forCommands.authorize({
                events: {
                  joined: { forAuthenticated: 'true' }
                }
              });
            }).is.throwing('Invalid authorization option.');
            done();
          });

          test('publishes an authorized event.', done => {
            const aggregateId = uuid(),
                  ownerId = uuid();

            const command = buildCommand('planning', 'peerGroup', aggregateId, 'join', {
              participant: 'Jane Doe'
            });

            command.addToken({ sub: ownerId });

            const aggregate = new Aggregate.Writable({
              app,
              writeModel,
              context: { name: 'planning' },
              aggregate: { name: 'peerGroup', id: aggregateId },
              command
            });

            aggregate.api.forEvents.setState({
              isAuthorized: { owner: ownerId }
            });

            aggregate.api.forCommands.authorize({
              commands: {
                join: { forPublic: true }
              },
              events: {
                joined: { forAuthenticated: false }
              }
            });

            assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
            assert.that(aggregate.instance.uncommittedEvents[0].context.name).is.equalTo('planning');
            assert.that(aggregate.instance.uncommittedEvents[0].aggregate.name).is.equalTo('peerGroup');
            assert.that(aggregate.instance.uncommittedEvents[0].aggregate.id).is.equalTo(aggregateId);
            assert.that(aggregate.instance.uncommittedEvents[0].name).is.equalTo('authorized');
            assert.that(aggregate.instance.uncommittedEvents[0].data).is.equalTo({
              commands: {
                join: { forPublic: true }
              },
              events: {
                joined: { forAuthenticated: false }
              }
            });
            done();
          });
        });
      });
    });

    suite('applySnapshot', () => {
      test('is a function.', done => {
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
        done();
      });

      test('throws an error if snapshot is missing.', done => {
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
        done();
      });

      test('overwrites the revision.', done => {
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
        done();
      });

      test('overwrites the state.', done => {
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
        done();
      });
    });
  });
});

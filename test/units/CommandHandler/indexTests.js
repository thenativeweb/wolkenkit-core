'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      eventStore = require('wolkenkit-eventstore/inmemory'),
      record = require('record-stdstreams'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4');

const buildCommand = require('../../shared/buildCommand'),
      CommandHandler = require('../../../CommandHandler'),
      Repository = require('../../../repository/Repository');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('CommandHandler', () => {
  const repository = new Repository();

  let commandHandler,
      token,
      user,
      writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', 'app')
    })).writeModel;

    await eventStore.initialize();

    repository.initialize({ app, writeModel, eventStore });
  });

  setup(async () => {
    commandHandler = new CommandHandler({ app, writeModel, repository });
    token = { sub: uuid() };
    user = { id: token.sub, token };
  });

  teardown(async () => {
    await eventStore.destroy();
  });

  test('is a function.', async () => {
    assert.that(CommandHandler).is.ofType('function');
  });

  test('throws an error if app is missing.', async () => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({});
      /* eslint-enable no-new */
    }).is.throwing('App is missing.');
  });

  test('throws an error if write model is missing.', async () => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({ app });
      /* eslint-enable no-new */
    }).is.throwing('Write model is missing.');
  });

  test('throws an error if repository is missing.', async () => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({ app, writeModel });
      /* eslint-enable no-new */
    }).is.throwing('Repository is missing.');
  });

  test('returns an object.', async () => {
    assert.that(new CommandHandler({ app, writeModel, repository })).is.ofType('object');
  });

  suite('validateCommand', () => {
    test('is a function.', async () => {
      assert.that(commandHandler.validateCommand).is.ofType('function');
    });

    test('throws an error if command is missing.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({});
      }).is.throwingAsync('Command is missing.');
    });

    test('throws an error if the context does not exist.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'non-existent' },
            aggregate: { name: 'sampleAggregate' },
            name: 'execute'
          }
        });
      }).is.throwingAsync('Invalid context name.');
    });

    test('throws an error if the aggregate does not exist.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'non-existent' },
            name: 'execute'
          }
        });
      }).is.throwingAsync('Invalid aggregate name.');
    });

    test('throws an error if the command name does not exist.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'non-existent'
          }
        });
      }).is.throwingAsync('Invalid command name.');
    });

    test('throws an error if a schema is provided and does not match.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'executeWithSchema',
            data: {}
          }
        });
      }).is.throwingAsync('Missing required property: requiredParameter (at command.data.requiredParameter).');
    });

    test('does not throw an error if everything is fine.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'executeWithSchema',
            data: {
              requiredParameter: 'foo'
            }
          }
        });
      }).is.not.throwingAsync();
    });

    test('does not throw an error if no schema exists.', async () => {
      await assert.that(async () => {
        await commandHandler.validateCommand({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'execute',
            data: {
              initiator: 'Jane Doe'
            }
          }
        });
      }).is.not.throwingAsync();
    });
  });

  suite('validateAuthorization', () => {
    test('is a function.', async () => {
      assert.that(commandHandler.validateAuthorization).is.ofType('function');
    });

    test('throws an error if command is missing.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({});
      }).is.throwingAsync('Command is missing.');
    });

    test('throws an error if metadata are missing.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({
          command: {}
        });
      }).is.throwingAsync('Metadata are missing.');
    });

    test('throws an error if aggregate is missing.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({
          command: {},
          metadata: {}
        });
      }).is.throwingAsync('Aggregate is missing.');
    });

    test('does not throw an error if isAuthorized returns true.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'executeWithIsAuthorizedTrue'
          },
          metadata: { client: { user }},
          aggregate: new app.ReadableAggregate({
            writeModel,
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate', id: uuid() }
          })
        });
      }).is.not.throwingAsync();
    });

    test('throws an error if isAuthorized returns false.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'executeWithIsAuthorizedFalse'
          },
          metadata: { client: { user }},
          aggregate: new app.ReadableAggregate({
            writeModel,
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate', id: uuid() }
          })
        });
      }).is.throwingAsync(ex => ex.code === 'ECOMMANDREJECTED' && ex.message === 'Access denied.');
    });

    test('throws an error if isAuthorized throws an error.', async () => {
      await assert.that(async () => {
        await commandHandler.validateAuthorization({
          command: {
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate' },
            name: 'executeWithIsAuthorizedThrowing'
          },
          metadata: { client: { user }},
          aggregate: new app.ReadableAggregate({
            writeModel,
            context: { name: 'sampleContext' },
            aggregate: { name: 'sampleAggregate', id: uuid() }
          })
        });
      }).is.throwingAsync(ex => ex.code === 'ECOMMANDREJECTED' && ex.message === 'Access denied.');
    });

    suite('services', () => {
      test('will be injected as third parameter.', async () => {
        await assert.that(async () => {
          await commandHandler.validateAuthorization({
            command: {
              context: { name: 'sampleContext' },
              aggregate: { name: 'sampleAggregate' },
              name: 'executeWithRequestServicesInIsAuthorized'
            },
            metadata: { client: { user }},
            aggregate: new app.ReadableAggregate({
              writeModel,
              context: { name: 'sampleContext' },
              aggregate: { name: 'sampleAggregate', id: uuid() }
            })
          });
        }).is.not.throwingAsync();
      });

      suite('logger', () => {
        test('logs messages.', async () => {
          const stop = record();

          await commandHandler.validateAuthorization({
            command: {
              context: { name: 'sampleContext' },
              aggregate: { name: 'sampleAggregate' },
              name: 'executeWithUseLoggerServiceInIsAuthorized'
            },
            metadata: { client: { user }},
            aggregate: new app.ReadableAggregate({
              writeModel,
              context: { name: 'sampleContext' },
              aggregate: { name: 'sampleAggregate', id: uuid() }
            })
          });

          const { stdout, stderr } = stop();
          const logMessage = JSON.parse(stdout);

          assert.that(logMessage.message).is.equalTo('Some message from isAuthorized.');
          assert.that(stderr).is.equalTo('');
        });
      });
    });
  });

  suite('handle', () => {
    test('is a function.', async () => {
      assert.that(commandHandler.handle).is.ofType('function');
    });

    test('handles a command for a new aggregate.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
        initiator: 'John Doe',
        destination: 'Somewhere over the rainbow'
      });

      command.addInitiator({ token });

      const aggregate = new app.WritableAggregate({
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: command.aggregate.id },
        command
      });

      await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });

      const uncommittedEvents = aggregate.instance.uncommittedEvents;

      assert.that(uncommittedEvents.length).is.equalTo(3);

      assert.that(uncommittedEvents[0].event.context.name).is.equalTo(command.context.name);
      assert.that(uncommittedEvents[0].event.aggregate.name).is.equalTo(command.aggregate.name);
      assert.that(uncommittedEvents[0].event.name).is.equalTo('transferredOwnership');
      assert.that(uncommittedEvents[0].event.data).is.equalTo({
        from: undefined,
        to: command.initiator.id
      });
      assert.that(uncommittedEvents[0].event.metadata.revision).is.equalTo(1);

      assert.that(uncommittedEvents[1].event.context.name).is.equalTo(command.context.name);
      assert.that(uncommittedEvents[1].event.aggregate.name).is.equalTo(command.aggregate.name);
      assert.that(uncommittedEvents[1].event.name).is.equalTo('started');
      assert.that(uncommittedEvents[1].event.data).is.equalTo(command.data);
      assert.that(uncommittedEvents[1].event.metadata.revision).is.equalTo(2);

      assert.that(uncommittedEvents[2].event.context.name).is.equalTo(command.context.name);
      assert.that(uncommittedEvents[2].event.aggregate.name).is.equalTo(command.aggregate.name);
      assert.that(uncommittedEvents[2].event.name).is.equalTo('joined');
      assert.that(uncommittedEvents[2].event.data).is.equalTo({ participant: command.data.initiator });
      assert.that(uncommittedEvents[2].event.initiator.id).is.equalTo(command.initiator.id);
      assert.that(uncommittedEvents[2].event.metadata.revision).is.equalTo(3);
    });

    test('throws an error for a rejected command.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
        participant: 'Jane Doe'
      });

      command.addInitiator({ token });

      const aggregate = new app.WritableAggregate({
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: command.aggregate.id },
        command
      });

      aggregate.applySnapshot({
        state: {
          participants: [ 'Jane Doe' ]
        },
        revision: 1
      });

      await assert.that(async () => {
        await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });
      }).is.throwingAsync(ex =>
        ex.name === 'CommandRejected' &&
        ex.message === 'Participant had already joined.');
    });

    test('throws an error for a failed command.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
        participant: 'Jane Doe'
      });

      command.addInitiator({ token });

      const aggregate = new app.WritableAggregate({
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: command.aggregate.id },
        command
      });

      await assert.that(async () => {
        await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });
      }).is.throwingAsync(ex =>
        ex.name === 'CommandFailed' &&
        ex.message === 'Failed to handle command.');
    });

    suite('services', () => {
      test('will be injected as third parameter.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'requestServices', {
          participant: 'Jane Doe'
        });

        command.addInitiator({ token });

        const aggregate = new app.WritableAggregate({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });
        }).is.not.throwingAsync('Services are missing.');
      });

      test('fails the command if a non-existent service is requested.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'requestNonExistentService', {
          participant: 'Jane Doe'
        });

        command.addInitiator({ token });

        const aggregate = new app.WritableAggregate({
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });
        }).is.throwingAsync(ex =>
          ex.name === 'CommandFailed' &&
          ex.message === 'Failed to handle command.');
      });

      suite('logger', () => {
        test('logs messages.', async () => {
          const command = buildCommand('planning', 'peerGroup', uuid(), 'useLoggerService', {
            participant: 'Jane Doe'
          });

          command.addInitiator({ token });

          const aggregate = new app.WritableAggregate({
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: command.aggregate.id },
            command
          });

          const stop = record();

          await commandHandler.handle({ aggregate, metadata: { client: { user }}, command });

          const { stdout, stderr } = stop();
          const logMessage = JSON.parse(stdout);

          assert.that(logMessage.message).is.equalTo('Some message from useLoggerService command.');
          assert.that(stderr).is.equalTo('');
        });
      });
    });
  });
});

'use strict';

const path = require('path');

const assert = require('assertthat'),
      EventStore = require('sparbuch/lib/postgres/Sparbuch'),
      record = require('record-stdstreams'),
      runfork = require('runfork'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../helpers/buildCommand'),
      CommandHandler = require('../../../CommandHandler'),
      env = require('../../helpers/env'),
      Repository = require('../../../repository/Repository');

const { writeModel } = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', 'app'));

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'keys', 'certificate.pem')
  }
});

suite('CommandHandler', () => {
  const eventStore = new EventStore(),
        repository = new Repository();

  suiteSetup(async () => {
    await eventStore.initialize({
      url: env.POSTGRES_URL_UNITS,
      namespace: 'testdomain'
    });

    repository.initialize({ app, writeModel, eventStore });
  });

  suiteTeardown(async () => {
    await eventStore.destroy();
  });

  setup(async () => {
    await new Promise(async (resolve, reject) => {
      try {
        await runfork({
          path: path.join(__dirname, '..', '..', 'helpers', 'runResetPostgres.js'),
          env: {
            NAMESPACE: 'testdomain',
            URL: env.POSTGRES_URL_UNITS
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

  suite('handle', () => {
    let commandHandler;

    setup(() => {
      commandHandler = new CommandHandler({ app, writeModel, repository });
    });

    test('is a function.', async () => {
      assert.that(commandHandler.handle).is.ofType('function');
    });

    test('handles a command for a new aggregate.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
        initiator: 'John Doe',
        destination: 'Somewhere over the rainbow'
      });

      command.addToken({
        sub: uuid()
      });

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: command.aggregate.id },
        command
      });

      await commandHandler.handle({ aggregate, command });

      const uncommittedEvents = aggregate.instance.uncommittedEvents;

      assert.that(uncommittedEvents.length).is.equalTo(2);

      assert.that(uncommittedEvents[0].context.name).is.equalTo(command.context.name);
      assert.that(uncommittedEvents[0].aggregate.name).is.equalTo(command.aggregate.name);
      assert.that(uncommittedEvents[0].name).is.equalTo('started');
      assert.that(uncommittedEvents[0].data).is.equalTo(command.data);
      assert.that(uncommittedEvents[0].metadata.revision).is.equalTo(1);

      assert.that(uncommittedEvents[1].context.name).is.equalTo(command.context.name);
      assert.that(uncommittedEvents[1].aggregate.name).is.equalTo(command.aggregate.name);
      assert.that(uncommittedEvents[1].name).is.equalTo('joined');
      assert.that(uncommittedEvents[1].data).is.equalTo({ participant: command.data.initiator });
      assert.that(uncommittedEvents[1].user.id).is.equalTo(command.user.id);
      assert.that(uncommittedEvents[1].metadata.revision).is.equalTo(2);
    });

    test('throws an error for a rejected command.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'join', {
        participant: 'Jane Doe'
      });

      command.addToken({
        sub: uuid()
      });

      const aggregate = new Aggregate.Writable({
        app,
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
        await commandHandler.handle({ aggregate, command });
      }).is.throwingAsync(ex =>
        ex.name === 'CommandRejected' &&
        ex.message === 'Participant had already joined.');
    });

    test('throws an error for a failed command.', async () => {
      const command = buildCommand('planning', 'peerGroup', uuid(), 'joinAndFail', {
        participant: 'Jane Doe'
      });

      command.addToken({
        sub: uuid()
      });

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: command.aggregate.id },
        command
      });

      await assert.that(async () => {
        await commandHandler.handle({ aggregate, command });
      }).is.throwingAsync(ex =>
        ex.name === 'CommandFailed' &&
        ex.message === 'Failed to handle command.');
    });

    suite('middleware', () => {
      test('throws an error for a failing middleware.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'joinWithFailingMiddleware', {
          participant: 'Jane Doe'
        });

        command.addToken({
          sub: uuid()
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, command });
        }).is.throwingAsync(ex =>
          ex.name === 'CommandFailed' &&
          ex.message === 'Failed to handle command.');
      });

      test('throws an error for a rejecting middleware.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'joinWithRejectingMiddleware', {
          participant: 'Jane Doe'
        });

        command.addToken({
          sub: uuid()
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, command });
        }).is.throwingAsync(ex =>
          ex.name === 'CommandRejected' &&
          ex.message === 'Rejected by middleware.');
      });

      test('lets a command pass through.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'joinWithPassingMiddleware', {
          participant: 'Jane Doe'
        });

        command.addToken({
          sub: uuid()
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await commandHandler.handle({ aggregate, command });
      });
    });

    suite('services', () => {
      test('will be injected as third parameter.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'requestServices', {
          participant: 'Jane Doe'
        });

        command.addToken({
          sub: uuid()
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, command });
        }).is.not.throwingAsync('Services are missing.');
      });

      test('fails the command if a non-existent service is requested.', async () => {
        const command = buildCommand('planning', 'peerGroup', uuid(), 'requestNonExistentService', {
          participant: 'Jane Doe'
        });

        command.addToken({
          sub: uuid()
        });

        const aggregate = new Aggregate.Writable({
          app,
          writeModel,
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: command.aggregate.id },
          command
        });

        await assert.that(async () => {
          await commandHandler.handle({ aggregate, command });
        }).is.throwingAsync(ex =>
          ex.name === 'CommandFailed' &&
          ex.message === 'Failed to handle command.');
      });

      suite('logger', () => {
        test('logs messages.', async () => {
          const command = buildCommand('planning', 'peerGroup', uuid(), 'useLoggerService', {
            participant: 'Jane Doe'
          });

          command.addToken({
            sub: uuid()
          });

          const aggregate = new Aggregate.Writable({
            app,
            writeModel,
            context: { name: 'planning' },
            aggregate: { name: 'peerGroup', id: command.aggregate.id },
            command
          });

          const stop = record();

          await commandHandler.handle({ aggregate, command });

          const { stdout, stderr } = stop();
          const logMessage = JSON.parse(stdout);

          assert.that(logMessage.message).is.equalTo('Some message from useLoggerService command.');
          assert.that(stderr).is.equalTo('');
        });
      });
    });
  });
});

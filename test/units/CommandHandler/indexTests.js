'use strict';

const path = require('path');

const assert = require('assertthat'),
      EventStore = require('sparbuch/lib/postgres/Sparbuch'),
      runfork = require('runfork'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../helpers/buildCommand'),
      CommandHandler = require('../../../CommandHandler'),
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

suite('CommandHandler', () => {
  const eventStore = new EventStore(),
        repository = new Repository();

  suiteSetup(done => {
    eventStore.initialize({
      url: env.POSTGRES_URL_UNITS,
      namespace: 'testdomain'
    }, err => {
      if (err) {
        return done(err);
      }

      repository.initialize({ app, writeModel, eventStore }, done);
    });
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
    assert.that(CommandHandler).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler();
      /* eslint-enable no-new */
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if app is missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({});
      /* eslint-enable no-new */
    }).is.throwing('App is missing.');
    done();
  });

  test('throws an error if write model is missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({ app });
      /* eslint-enable no-new */
    }).is.throwing('Write model is missing.');
    done();
  });

  test('throws an error if repository is missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new CommandHandler({ app, writeModel });
      /* eslint-enable no-new */
    }).is.throwing('Repository is missing.');
    done();
  });

  test('returns an object.', done => {
    assert.that(new CommandHandler({ app, writeModel, repository })).is.ofType('object');
    done();
  });

  suite('handle', () => {
    let commandHandler;

    setup(() => {
      commandHandler = new CommandHandler({ app, writeModel, repository });
    });

    test('is a function.', done => {
      assert.that(commandHandler.handle).is.ofType('function');
      done();
    });

    test('handles a command for a new aggregate.', done => {
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

      commandHandler.handle({ aggregate, command }, errHandle => {
        assert.that(errHandle).is.null();

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

        done();
      });
    });

    test('returns an error for a rejected command.', done => {
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

      commandHandler.handle({ aggregate, command }, err => {
        assert.that(err.name).is.equalTo('CommandRejected');
        assert.that(err.message).is.equalTo('Participant had already joined.');
        done();
      });
    });

    test('returns an error for a failed command.', done => {
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

      commandHandler.handle({ aggregate, command }, err => {
        assert.that(err.name).is.equalTo('CommandFailed');
        assert.that(err.message).is.equalTo('Failed to handle command.');
        done();
      });
    });

    suite('middleware', () => {
      test('returns an error for a failing middleware.', done => {
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

        commandHandler.handle({ aggregate, command }, err => {
          assert.that(err.name).is.equalTo('CommandFailed');
          assert.that(err.message).is.equalTo('Failed to handle command.');
          done();
        });
      });

      test('returns an error for a rejecting middleware.', done => {
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

        commandHandler.handle({ aggregate, command }, err => {
          assert.that(err.name).is.equalTo('CommandRejected');
          assert.that(err.message).is.equalTo('Rejected by middleware.');
          done();
        });
      });

      test('lets a command pass through.', done => {
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

        commandHandler.handle({ aggregate, command }, err => {
          assert.that(err).is.null();
          done();
        });
      });
    });

    suite('services', () => {
      test('will be injected if a command requests 4 parameters.', done => {
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

        commandHandler.handle({ aggregate, command }, err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('fails the command if a non-existent service is requested.', done => {
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

        commandHandler.handle({ aggregate, command }, err => {
          assert.that(err.name).is.equalTo('CommandFailed');
          assert.that(err.cause.message).is.equalTo('Unknown service \'non-existent-service\'.');
          done();
        });
      });

      suite('logger', () => {
        test('logs messages.', done => {
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

          commandHandler.handle({ aggregate, command }, err => {
            assert.that(err).is.null();
            done();
          });
        });
      });
    });
  });
});

'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../helpers/buildCommand'),
      isAccessGranted = require('../../../../appLogic/preProcess/isAccessGranted');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', 'app')).writeModel;

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'keys', 'certificate.pem')
  }
});

suite('isAccessGranted', () => {
  let aggregate,
      command;

  setup(() => {
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
  });

  test('is a function.', done => {
    assert.that(isAccessGranted).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      isAccessGranted();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if aggregate is missing.', done => {
    assert.that(() => {
      isAccessGranted({});
    }).is.throwing('Aggregate is missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      isAccessGranted({ aggregate });
    }).is.throwing('Command is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = isAccessGranted({ aggregate, command });

      assert.that(middleware).is.ofType('function');
      done();
    });

    suite('access for owner', () => {
      setup(() => {
        aggregate.applySnapshot({
          state: {
            isAuthorized: {
              owner: command.user.id,
              commands: {
                join: {
                  forAuthenticated: false,
                  forPublic: false
                }
              }
            }
          },
          metadata: { revision: 1 }
        });
      });

      test('accepts the owner.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('rejects authenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.not.null();
          done();
        });
      });

      test('rejects unauthenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: 'anonymous'
        });

        middleware(err => {
          assert.that(err).is.not.null();
          done();
        });
      });
    });

    suite('access for authenticated users', () => {
      setup(() => {
        aggregate.applySnapshot({
          state: {
            isAuthorized: {
              owner: command.user.id,
              commands: {
                join: {
                  forAuthenticated: true,
                  forPublic: false
                }
              }
            }
          },
          metadata: { revision: 1 }
        });
      });

      test('accepts the owner.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('accepts authenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('rejects unauthenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: 'anonymous'
        });

        middleware(err => {
          assert.that(err).is.not.null();
          done();
        });
      });
    });

    suite('access for public', () => {
      setup(() => {
        aggregate.applySnapshot({
          state: {
            isAuthorized: {
              owner: command.user.id,
              commands: {
                join: {
                  forAuthenticated: false,
                  forPublic: true
                }
              }
            }
          },
          metadata: { revision: 1 }
        });
      });

      test('accepts the owner.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('accepts authenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('accepts unauthenticated users.', done => {
        const middleware = isAccessGranted({ aggregate, command });

        command.addToken({
          sub: 'anonymous'
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });
    });
  });
});

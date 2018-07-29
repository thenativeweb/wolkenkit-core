'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../shared/buildCommand'),
      isAccessGrantedToAggregate = require('../../../../appLogic/preProcess/isAccessGrantedToAggregate');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('isAccessGrantedToAggregate', () => {
  let aggregate,
      command,
      writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', '..', 'app')
    })).writeModel;
  });

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

  test('is a function.', async () => {
    assert.that(isAccessGrantedToAggregate).is.ofType('function');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await isAccessGrantedToAggregate({});
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await isAccessGrantedToAggregate({ aggregate });
    }).is.throwingAsync('Command is missing.');
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

    test('accepts the owner.', async () => {
      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('rejects authenticated users.', async () => {
      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.throwingAsync('Access denied.');
    });

    test('rejects unauthenticated users.', async () => {
      command.addToken({
        sub: 'anonymous'
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.throwingAsync('Access denied.');
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

    test('accepts the owner.', async () => {
      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('accepts authenticated users.', async () => {
      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('rejects unauthenticated users.', async () => {
      command.addToken({
        sub: 'anonymous'
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.throwingAsync('Access denied.');
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

    test('accepts the owner.', async () => {
      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('accepts authenticated users.', async () => {
      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('accepts unauthenticated users.', async () => {
      command.addToken({
        sub: 'anonymous'
      });

      await assert.that(async () => {
        await isAccessGrantedToAggregate({ aggregate, command });
      }).is.not.throwingAsync();
    });
  });
});

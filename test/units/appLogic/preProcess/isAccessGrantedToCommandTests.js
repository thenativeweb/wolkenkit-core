'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../shared/buildCommand'),
      isAccessGrantedToCommand = require('../../../../appLogic/preProcess/isAccessGrantedToCommand');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('isAccessGrantedToCommand', () => {
  let aggregateId,
      token,
      writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', '..', 'app')
    })).writeModel;
  });

  setup(() => {
    aggregateId = uuid();
    token = { sub: uuid() };
  });

  test('is a function.', async () => {
    assert.that(isAccessGrantedToCommand).is.ofType('function');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await isAccessGrantedToCommand({});
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if command is missing.', async () => {
    const aggregate = {};

    await assert.that(async () => {
      await isAccessGrantedToCommand({ aggregate });
    }).is.throwingAsync('Command is missing.');
  });

  suite('command for owner', () => {
    test('accepts authenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'startForOwner', {
        initiator: 'Jane Doe',
        destination: 'Riva'
      });

      command.addToken(token);

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        command
      });

      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('rejects unauthenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'startForOwner', {
        initiator: 'Jane Doe',
        destination: 'Riva'
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

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.throwingAsync('Access denied.');
    });
  });

  suite('command for authenticated', () => {
    test('accepts authenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'startForAuthenticated', {
        initiator: 'Jane Doe',
        destination: 'Riva'
      });

      command.addToken(token);

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        command
      });

      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('rejects unauthenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'startForAuthenticated', {
        initiator: 'Jane Doe',
        destination: 'Riva'
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

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.throwingAsync('Access denied.');
    });
  });

  suite('command for public', () => {
    test('accepts authenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
        initiator: 'Jane Doe',
        destination: 'Riva'
      });

      command.addToken(token);

      const aggregate = new Aggregate.Writable({
        app,
        writeModel,
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        command
      });

      command.addToken({
        sub: uuid()
      });

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.not.throwingAsync();
    });

    test('accepts unauthenticated users.', async () => {
      const command = buildCommand('planning', 'peerGroup', aggregateId, 'start', {
        initiator: 'Jane Doe',
        destination: 'Riva'
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

      await assert.that(async () => {
        await isAccessGrantedToCommand({ aggregate, command });
      }).is.not.throwingAsync();
    });
  });
});

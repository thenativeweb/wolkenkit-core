'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../shared/buildCommand'),
      initializeOwnership = require('../../../../appLogic/preProcess/initializeOwnership');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('initializeOwnership', () => {
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
    assert.that(initializeOwnership).is.ofType('function');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await initializeOwnership({});
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await initializeOwnership({ aggregate });
    }).is.throwingAsync('Command is missing.');
  });

  test('does not transfer the ownership if the aggregate already exists.', async () => {
    aggregate.applySnapshot({
      state: { initiator: 'Jane Doe', destination: 'Riva' },
      revision: 1
    });

    await initializeOwnership({ aggregate, command });

    assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);
  });

  test('transfers the ownership if the aggregate does not yet exist.', async () => {
    await initializeOwnership({ aggregate, command });

    assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
    assert.that(aggregate.instance.uncommittedEvents[0].name).is.equalTo('transferredOwnership');
    assert.that(aggregate.instance.uncommittedEvents[0].data.to).is.equalTo(command.user.id);
  });
});

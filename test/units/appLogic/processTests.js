'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../shared/buildCommand'),
      preProcessSteps = require('../../../appLogic/preProcess'),
      process = require('../../../appLogic/process');

const { writeModel } = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', 'app'));

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

suite('process', () => {
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

  test('is a function.', async () => {
    assert.that(process).is.ofType('function');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await process({});
    }).is.throwingAsync('Command is missing.');
  });

  test('throws an error if steps are missing.', async () => {
    await assert.that(async () => {
      await process({ command });
    }).is.throwingAsync('Steps are missing.');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await process({ command, steps: preProcessSteps });
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if a middleware step fails.', async () => {
    aggregate.applySnapshot({
      state: {
        isAuthorized: {
          owner: uuid(),
          commands: {
            join: { forAuthenticated: false, forPublic: false }
          }
        }
      },
      revision: 1
    });

    await assert.that(async () => {
      await process({ command, steps: preProcessSteps, aggregate });
    }).is.throwingAsync('Access denied.');
  });

  test('does not throw an error if all middleware steps succeed.', async () => {
    await assert.that(async () => {
      await process({ command, steps: preProcessSteps, aggregate });
    }).is.not.throwingAsync();
  });
});

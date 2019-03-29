'use strict';

const assert = require('assertthat'),
      uuid = require('uuidv4');

const buildCommand = require('../../shared/buildCommand'),
      impersonateCommand = require('../../../appLogic/impersonateCommand');

suite('impersonateCommand', () => {
  test('is a function.', async () => {
    assert.that(impersonateCommand).is.ofType('function');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await impersonateCommand({});
    }).is.throwingAsync('Command is missing.');
  });

  test('does not change the user if the command does not want to impersonate.', async () => {
    const initiatorId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addInitiator({ token: { sub: initiatorId }});

    await impersonateCommand({ command });

    assert.that(command.initiator.id).is.equalTo(initiatorId);
  });

  test('throws an error if the command wants to impersonate, but is not allowed to.', async () => {
    const initiatorId = uuid();
    const desiredInitiatorId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addInitiator({ token: { sub: initiatorId }});

    command.custom.asInitiator = desiredInitiatorId;

    await assert.that(async () => {
      await impersonateCommand({ command });
    }).is.throwingAsync('Impersonation denied.');

    assert.that(command.initiator.id).is.equalTo(initiatorId);
  });

  test('impersonates the command if the command wants to impersonate and it is allowed to.', async () => {
    const initiatorId = uuid();
    const desiredInitiatorId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addInitiator({ token: { sub: initiatorId, 'can-impersonate': true }});

    command.custom.asInitiator = desiredInitiatorId;

    await impersonateCommand({ command });

    assert.that(command.initiator.id).is.equalTo(desiredInitiatorId);
    assert.that(command.custom.asInitiator).is.undefined();
  });
});

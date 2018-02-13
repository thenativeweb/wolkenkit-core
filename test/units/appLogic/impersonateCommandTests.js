'use strict';

const assert = require('assertthat'),
      uuid = require('uuidv4');

const buildCommand = require('../../helpers/buildCommand'),
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
    const userId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addToken({
      sub: userId
    });

    await impersonateCommand({ command });

    assert.that(command.user.id).is.equalTo(userId);
  });

  test('throws an error if the command wants to impersonate, but is not allowed to.', async () => {
    const userId = uuid();
    const desiredUserId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addToken({
      sub: userId
    });

    command.custom.asUser = desiredUserId;

    await assert.that(async () => {
      await impersonateCommand({ command });
    }).is.throwingAsync('Impersonation denied.');

    assert.that(command.user.id).is.equalTo(userId);
  });

  test('impersonates the command if the command wants to impersonate and it is allowed to.', async () => {
    const userId = uuid();
    const desiredUserId = uuid();

    const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
      initiator: 'Jane Doe',
      destination: 'Riva'
    });

    command.addToken({
      sub: userId,
      'can-impersonate': true
    });

    command.custom.asUser = desiredUserId;

    await impersonateCommand({ command });

    assert.that(command.user.id).is.equalTo(desiredUserId);
    assert.that(command.custom.asUser).is.undefined();
  });
});

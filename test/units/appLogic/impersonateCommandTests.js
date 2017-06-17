'use strict';

const assert = require('assertthat'),
      uuid = require('uuidv4');

const buildCommand = require('../../helpers/buildCommand'),
      impersonateCommand = require('../../../appLogic/impersonateCommand');

suite('impersonateCommand', () => {
  test('is a function.', done => {
    assert.that(impersonateCommand).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      impersonateCommand();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      impersonateCommand({});
    }).is.throwing('Command is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = impersonateCommand({
        command: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const middleware = impersonateCommand({
        command: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Callback is missing.');
      done();
    });

    test('does not change the user if the command does not want to impersonate.', done => {
      const userId = uuid();

      const command = buildCommand('planning', 'peerGroup', uuid(), 'start', {
        initiator: 'Jane Doe',
        destination: 'Riva'
      });

      command.addToken({
        sub: userId
      });

      const middleware = impersonateCommand({ command });

      middleware(err => {
        assert.that(err).is.null();
        assert.that(command.user.id).is.equalTo(userId);
        done();
      });
    });

    test('returns an error if the command wants to impersonate, but is not allowed to.', done => {
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

      const middleware = impersonateCommand({ command });

      middleware(err => {
        assert.that(err).is.not.null();
        assert.that(command.user.id).is.equalTo(userId);
        done();
      });
    });

    test('impersonates the command if the command wants to impersonate and it is allowed to.', done => {
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

      const middleware = impersonateCommand({ command });

      middleware(err => {
        assert.that(err).is.null();
        assert.that(command.user.id).is.equalTo(desiredUserId);
        assert.that(command.custom.asUser).is.undefined();
        done();
      });
    });
  });
});

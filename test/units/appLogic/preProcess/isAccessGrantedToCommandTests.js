'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../helpers/buildCommand'),
      isAccessGrantedToCommand = require('../../../../appLogic/preProcess/isAccessGrantedToCommand');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', 'app')).writeModel;

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'keys', 'certificate.pem')
  }
});

suite('isAccessGrantedToCommand', () => {
  let aggregateId,
      token;

  setup(() => {
    aggregateId = uuid();
    token = { sub: uuid() };
  });

  test('is a function.', done => {
    assert.that(isAccessGrantedToCommand).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      isAccessGrantedToCommand();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if aggregate is missing.', done => {
    assert.that(() => {
      isAccessGrantedToCommand({});
    }).is.throwing('Aggregate is missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    const aggregate = {};

    assert.that(() => {
      isAccessGrantedToCommand({ aggregate });
    }).is.throwing('Command is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const aggregate = {},
            command = {};

      const middleware = isAccessGrantedToCommand({ aggregate, command });

      assert.that(middleware).is.ofType('function');
      done();
    });

    suite('command for owner', () => {
      test('accepts authenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('rejects unauthenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        middleware(err => {
          assert.that(err).is.not.null();
          done();
        });
      });
    });

    suite('command for authenticated', () => {
      test('accepts authenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('rejects unauthenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        middleware(err => {
          assert.that(err).is.not.null();
          done();
        });
      });
    });

    suite('command for public', () => {
      test('accepts authenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        command.addToken({
          sub: uuid()
        });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });

      test('accepts unauthenticated users.', done => {
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

        const middleware = isAccessGrantedToCommand({ aggregate, command });

        middleware(err => {
          assert.that(err).is.null();
          done();
        });
      });
    });
  });
});

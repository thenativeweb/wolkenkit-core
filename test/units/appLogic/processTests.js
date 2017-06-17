'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../repository/Aggregate'),
      buildCommand = require('../../helpers/buildCommand'),
      preProcessSteps = require('../../../appLogic/preProcess'),
      process = require('../../../appLogic/process');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', 'app')).writeModel;

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', 'keys', 'certificate.pem')
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

  test('is a function.', done => {
    assert.that(process).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      process();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      process({});
    }).is.throwing('Command is missing.');
    done();
  });

  test('throws an error if steps is missing.', done => {
    assert.that(() => {
      process({ command });
    }).is.throwing('Steps are missing.');
    done();
  });

  suite('middleware', () => {
    let middleware;

    setup(() => {
      middleware = process({ command, steps: preProcessSteps });
    });

    test('is a function.', done => {
      assert.that(middleware).is.ofType('function');
      done();
    });

    test('returns an error if a middleware step fails.', done => {
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

      middleware(aggregate, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('does not return an error if all middleware steps succeed.', done => {
      middleware(aggregate, err => {
        assert.that(err).is.null();
        done();
      });
    });
  });
});

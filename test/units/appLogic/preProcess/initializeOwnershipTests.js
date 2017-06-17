'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Aggregate = require('../../../../repository/Aggregate'),
      buildCommand = require('../../../helpers/buildCommand'),
      initializeOwnership = require('../../../../appLogic/preProcess/initializeOwnership');

const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', 'app')).writeModel;

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'keys', 'certificate.pem')
  }
});

suite('initializeOwnership', () => {
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
    assert.that(initializeOwnership).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      initializeOwnership();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if aggregate is missing.', done => {
    assert.that(() => {
      initializeOwnership({});
    }).is.throwing('Aggregate is missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      initializeOwnership({ aggregate });
    }).is.throwing('Command is missing.');
    done();
  });

  suite('middleware', () => {
    let middleware;

    setup(() => {
      middleware = initializeOwnership({ aggregate, command });
    });

    test('is a function.', done => {
      assert.that(middleware).is.ofType('function');
      done();
    });

    test('does not transfer the ownership if the aggregate already exists.', done => {
      aggregate.applySnapshot({
        state: { initiator: 'Jane Doe', destination: 'Riva' },
        revision: 1
      });

      middleware(err => {
        assert.that(err).is.null();
        assert.that(aggregate.instance.uncommittedEvents).is.equalTo([]);
        done();
      });
    });

    test('transfers the ownership if the aggregate does not yet exist.', done => {
      middleware(err => {
        assert.that(err).is.null();
        assert.that(aggregate.instance.uncommittedEvents.length).is.equalTo(1);
        assert.that(aggregate.instance.uncommittedEvents[0].name).is.equalTo('transferredOwnership');
        assert.that(aggregate.instance.uncommittedEvents[0].data.to).is.equalTo(command.user.id);
        done();
      });
    });
  });
});

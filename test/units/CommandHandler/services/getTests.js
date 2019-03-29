'use strict';

const path = require('path');

const applicationManager = require('wolkenkit-application'),
      assert = require('assertthat'),
      tailwind = require('tailwind');

const buildCommand = require('../../../shared/buildCommand'),
      getServices = require('../../../../CommandHandler/services/get'),
      Repository = require('../../../../repository/Repository');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

const command = buildCommand('planning', 'peerGroup', 'join', {});
const metadata = { client: {}};
const repository = new Repository();

suite('getServices', () => {
  let writeModel;

  suiteSetup(async () => {
    writeModel = (await applicationManager.load({
      directory: path.join(__dirname, '..', '..', '..', '..', 'app')
    })).writeModel;
  });

  test('is a function.', async () => {
    assert.that(getServices).is.ofType('function');
  });

  test('throws an error if app is missing.', async () => {
    assert.that(() => {
      getServices({});
    }).is.throwing('App is missing.');
  });

  test('throws an error if command is missing.', async () => {
    assert.that(() => {
      getServices({ app });
    }).is.throwing('Command is missing.');
  });

  test('throws an error if metadata are missing.', async () => {
    assert.that(() => {
      getServices({ app, command });
    }).is.throwing('Metadata are missing.');
  });

  test('throws an error if repository is missing.', async () => {
    assert.that(() => {
      getServices({ app, command, metadata });
    }).is.throwing('Repository is missing.');
  });

  test('throws an error if write model is missing.', async () => {
    assert.that(() => {
      getServices({ app, command, metadata, repository });
    }).is.throwing('Write model is missing.');
  });

  test('returns the services.', async () => {
    const services = getServices({ app, command, metadata, repository, writeModel });

    assert.that(services).is.ofType('object');
    assert.that(services.app).is.ofType('object');
    assert.that(services.client).is.ofType('object');
    assert.that(services.logger).is.ofType('object');
  });
});

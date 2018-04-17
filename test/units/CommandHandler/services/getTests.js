'use strict';

const path = require('path');

const assert = require('assertthat'),
      tailwind = require('tailwind'),
      WolkenkitApplication = require('wolkenkit-application');

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
const repository = new Repository();
const { writeModel } = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', 'app'));

suite('getServices', () => {
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

  test('throws an error if repository is missing.', async () => {
    assert.that(() => {
      getServices({ app, command });
    }).is.throwing('Repository is missing.');
  });

  test('throws an error if write model is missing.', async () => {
    assert.that(() => {
      getServices({ app, command, repository });
    }).is.throwing('Write model is missing.');
  });

  test('returns the services.', async () => {
    const services = getServices({ app, command, repository, writeModel });

    assert.that(services).is.ofType('object');
    assert.that(services.app).is.ofType('object');
    assert.that(services.logger).is.ofType('object');
  });
});

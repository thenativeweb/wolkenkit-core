'use strict';

const path = require('path');

const assert = require('assertthat'),
      record = require('record-stdstreams'),
      tailwind = require('tailwind');

const buildCommand = require('../../../shared/buildCommand'),
      getLogger = require('../../../../CommandHandler/services/getLogger');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', 'shared', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', 'shared', 'keys', 'certificate.pem')
  }
});

const command = buildCommand('planning', 'peerGroup', 'join', {});

suite('getLogger', () => {
  test('is a function.', async () => {
    assert.that(getLogger).is.ofType('function');
  });

  test('throws an error if app is missing.', async () => {
    assert.that(() => {
      getLogger({});
    }).is.throwing('App is missing.');
  });

  test('throws an error if command is missing.', async () => {
    assert.that(() => {
      getLogger({ app });
    }).is.throwing('Command is missing.');
  });

  test('returns a logger.', async () => {
    const logger = getLogger({ app, command });

    assert.that(logger).is.ofType('object');
    assert.that(logger.info).is.ofType('function');
  });

  test('returns a logger that uses the correct file name.', async () => {
    const logger = getLogger({ app, command });

    const stop = record();

    logger.info('Some log message...');

    const { stdout, stderr } = stop();

    const logMessage = JSON.parse(stdout);

    assert.that(logMessage.source).is.equalTo('/wolkenkit/app/server/writeModel/planning/peerGroup.js');
    assert.that(stderr).is.equalTo('');
  });
});

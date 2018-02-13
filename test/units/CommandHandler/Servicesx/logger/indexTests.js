'use strict';

const path = require('path');

const assert = require('assertthat'),
      record = require('record-stdstreams'),
      tailwind = require('tailwind');

const logger = require('../../../../../CommandHandler/Services/logger');

const app = tailwind.createApp({
  keys: path.join(__dirname, '..', '..', '..', '..', 'keys'),
  identityProvider: {
    name: 'auth.wolkenkit.io',
    certificate: path.join(__dirname, '..', '..', '..', '..', 'keys', 'certificate.pem')
  }
});

suite('logger', () => {
  test('is a function.', done => {
    assert.that(logger).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      logger();
    }).is.throwing('Options are missing.');
    done();
  });

  test('returns a logger factory function.', done => {
    const getLogger = logger({ app });

    assert.that(getLogger).is.ofType('function');
    done();
  });

  suite('getLogger', () => {
    let instance;

    setup(() => {
      instance = logger({ app })();
    });

    test('returns a logger.', done => {
      assert.that(instance).is.ofType('object');
      assert.that(instance.info).is.ofType('function');
      done();
    });

    test('returns a logger that uses the correct file name.', done => {
      record(stop => {
        instance.info('Some log message...');
        stop();
      }, (err, stdout) => {
        assert.that(err).is.null();

        const logMessage = JSON.parse(stdout);

        assert.that(logMessage.source.endsWith('mocha/lib/runnable.js')).is.true();
        done();
      });
    });
  });
});

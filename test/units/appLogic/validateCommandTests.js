'use strict';

const assert = require('assertthat');

const validateCommand = require('../../../appLogic/validateCommand');

suite('validateCommand', () => {
  test('is a function.', done => {
    assert.that(validateCommand).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      validateCommand();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      validateCommand({});
    }).is.throwing('Command is missing.');
    done();
  });

  test('throws an error if write model is missing.', done => {
    assert.that(() => {
      validateCommand({
        command: {}
      });
    }).is.throwing('Write model is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = validateCommand({
        command: {},
        writeModel: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const middleware = validateCommand({
        command: {},
        writeModel: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Callback is missing.');
      done();
    });

    test('returns an error if the context does not exist.', done => {
      const middleware = validateCommand({
        command: {
          context: { name: 'non-existent' },
          aggregate: { name: 'peerGroup' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });

      middleware(err => {
        assert.that(err).is.not.null();
        assert.that(err.message).is.equalTo('Invalid context name.');
        done();
      });
    });

    test('returns an error if the aggregate does not exist.', done => {
      const middleware = validateCommand({
        command: {
          context: { name: 'planning' },
          aggregate: { name: 'non-existent' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });

      middleware(err => {
        assert.that(err).is.not.null();
        assert.that(err.message).is.equalTo('Invalid aggregate name.');
        done();
      });
    });

    test('does not return an error if everything is fine.', done => {
      const middleware = validateCommand({
        command: {
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });

      middleware(err => {
        assert.that(err).is.null();
        done();
      });
    });
  });
});

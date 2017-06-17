'use strict';

const assert = require('assertthat');

const handleCommand = require('../../../appLogic/handleCommand');

suite('handleCommand', () => {
  test('is a function.', done => {
    assert.that(handleCommand).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      handleCommand();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      handleCommand({});
    }).is.throwing('Command is missing.');
    done();
  });

  test('throws an error if command handler is missing.', done => {
    assert.that(() => {
      handleCommand({
        command: {}
      });
    }).is.throwing('Command handler is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = handleCommand({
        command: {},
        commandHandler: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if aggregate is missing.', done => {
      const middleware = handleCommand({
        command: {},
        commandHandler: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Aggregate is missing.');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const middleware = handleCommand({
        command: {},
        commandHandler: {}
      });

      assert.that(() => {
        middleware({});
      }).is.throwing('Callback is missing.');
      done();
    });

    test('returns an error if the command handler fails.', done => {
      const middleware = handleCommand({
        command: {},
        commandHandler: {
          handle (options, callback) {
            callback(new Error());
          }
        }
      });

      middleware({}, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('returns the aggregate if the command handler succeeds.', done => {
      const middleware = handleCommand({
        command: {},
        commandHandler: {
          handle (options, callback) {
            callback(null);
          }
        }
      });

      const aggregate = {};

      middleware(aggregate, (err, receivedAggregate) => {
        assert.that(err).is.null();
        assert.that(receivedAggregate).is.sameAs(aggregate);
        done();
      });
    });
  });
});

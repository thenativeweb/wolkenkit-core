'use strict';

const assert = require('assertthat');

const loadAggregate = require('../../../appLogic/loadAggregate');

suite('loadAggregate', () => {
  test('is a function.', done => {
    assert.that(loadAggregate).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      loadAggregate();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if command is missing.', done => {
    assert.that(() => {
      loadAggregate({});
    }).is.throwing('Command is missing.');
    done();
  });

  test('throws an error if repository is missing.', done => {
    assert.that(() => {
      loadAggregate({
        command: {}
      });
    }).is.throwing('Repository is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = loadAggregate({
        command: {},
        repository: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const middleware = loadAggregate({
        command: {},
        repository: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Callback is missing.');
      done();
    });

    test('returns an error if the repository fails.', done => {
      const middleware = loadAggregate({
        command: {},
        repository: {
          loadAggregateFor (command, callback) {
            callback(new Error());
          }
        }
      });

      middleware(err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('returns the aggregate if the command handler succeeds.', done => {
      const aggregate = {},
            command = {};

      const middleware = loadAggregate({
        command,
        repository: {
          loadAggregateFor (receivedCommand, callback) {
            assert.that(receivedCommand).is.sameAs(command);
            callback(null, aggregate);
          }
        }
      });

      middleware((err, receivedAggregate) => {
        assert.that(err).is.null();
        assert.that(receivedAggregate).is.sameAs(aggregate);
        done();
      });
    });
  });
});

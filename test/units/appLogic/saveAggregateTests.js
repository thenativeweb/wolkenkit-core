'use strict';

const _ = require('lodash'),
      assert = require('assertthat'),
      uuid = require('uuidv4');

const buildEvent = require('../../helpers/buildEvent'),
      saveAggregate = require('../../../appLogic/saveAggregate');

suite('saveAggregate', () => {
  test('is a function.', done => {
    assert.that(saveAggregate).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      saveAggregate();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if repository is missing.', done => {
    assert.that(() => {
      saveAggregate({});
    }).is.throwing('Repository is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = saveAggregate({
        repository: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if aggregate is missing.', done => {
      const middleware = saveAggregate({
        repository: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Aggregate is missing.');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const middleware = saveAggregate({
        repository: {}
      });

      assert.that(() => {
        middleware({});
      }).is.throwing('Callback is missing.');
      done();
    });

    test('returns an error if the repository fails.', done => {
      const aggregate = {};

      const middleware = saveAggregate({
        repository: {
          saveAggregate (receivedAggregate, callback) {
            callback(new Error());
          }
        }
      });

      middleware(aggregate, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('returns the aggregate and the committed events if the repository succeeds.', done => {
      const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: []
      });

      const aggregate = {
        instance: {
          id: uuid(),
          uncommittedEvents: [ eventStarted ]
        }
      };

      const middleware = saveAggregate({
        repository: {
          saveAggregate (receivedAggregate, callback) {
            assert.that(receivedAggregate).is.sameAs(aggregate);

            const committedEvents = _.cloneDeep(receivedAggregate.instance.uncommittedEvents);

            callback(null, committedEvents);
          }
        }
      });

      middleware(aggregate, (err, savedAggregate, committedEvents) => {
        assert.that(err).is.null();
        assert.that(savedAggregate).is.sameAs(aggregate);
        assert.that(committedEvents.length).is.equalTo(1);
        assert.that(committedEvents).is.not.sameAs(aggregate.instance.uncommittedEvents);
        assert.that(committedEvents[0]).is.not.sameAs(aggregate.instance.uncommittedEvents[0]);
        assert.that(committedEvents[0].name).is.equalTo(aggregate.instance.uncommittedEvents[0].name);
        done();
      });
    });
  });
});

'use strict';

const assert = require('assertthat'),
      uuid = require('uuidv4');

const buildEvent = require('../../helpers/buildEvent'),
      publishEvents = require('../../../appLogic/publishEvents');

suite('publishEvents', () => {
  test('is a function.', done => {
    assert.that(publishEvents).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      publishEvents();
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if event bus is missing.', done => {
    assert.that(() => {
      publishEvents({});
    }).is.throwing('Event bus is missing.');
    done();
  });

  test('throws an error if flow bus is missing.', done => {
    assert.that(() => {
      publishEvents({
        eventbus: {}
      });
    }).is.throwing('Flow bus is missing.');
    done();
  });

  test('throws an error if event store is missing.', done => {
    assert.that(() => {
      publishEvents({
        eventbus: {},
        flowbus: {}
      });
    }).is.throwing('Event store is missing.');
    done();
  });

  suite('middleware', () => {
    test('is a function.', done => {
      const middleware = publishEvents({
        eventbus: {},
        flowbus: {},
        eventStore: {}
      });

      assert.that(middleware).is.ofType('function');
      done();
    });

    test('throws an error if aggregate id is missing.', done => {
      const middleware = publishEvents({
        eventbus: {},
        flowbus: {},
        eventStore: {}
      });

      assert.that(() => {
        middleware();
      }).is.throwing('Aggregate id is missing.');
      done();
    });

    test('throws an error if callback is missing.', done => {
      const aggregateId = uuid();
      const middleware = publishEvents({
        eventbus: {},
        flowbus: {},
        eventStore: {}
      });

      assert.that(() => {
        middleware(aggregateId);
      }).is.throwing('Callback is missing.');
      done();
    });

    test('returns an error if publishing to the event bus fails.', done => {
      const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: []
      });

      eventStarted.metadata.position = 1;

      const aggregateId = uuid(),
            committedEvents = [ eventStarted ];

      const middleware = publishEvents({
        eventbus: {
          outgoing: {
            write () {
              throw new Error('Error during write.');
            }
          }
        },
        flowbus: {},
        eventStore: {}
      });

      middleware(aggregateId, committedEvents, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('returns an error if publishing to the flow bus fails.', done => {
      const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: []
      });

      eventStarted.metadata.position = 1;

      const aggregateId = uuid(),
            committedEvents = [ eventStarted ];

      const middleware = publishEvents({
        eventbus: {
          outgoing: {
            write () {}
          }
        },
        flowbus: {
          outgoing: {
            write () {
              throw new Error('Error during write.');
            }
          }
        },
        eventStore: {}
      });

      middleware(aggregateId, committedEvents, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('returns an error if marking published events fails.', done => {
      const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: []
      });

      eventStarted.metadata.position = 1;

      const aggregateId = uuid();
      const committedEvents = [ eventStarted ];

      const middleware = publishEvents({
        eventbus: {
          outgoing: {
            write () {}
          }
        },
        flowbus: {
          outgoing: {
            write () {}
          }
        },
        eventStore: {
          markEventsAsPublished (options, callback) {
            callback(new Error());
          }
        }
      });

      middleware(aggregateId, committedEvents, err => {
        assert.that(err).is.not.null();
        done();
      });
    });

    test('does not return an error if publishing and marking events succeeds.', done => {
      const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: []
      });

      eventStarted.metadata.position = 1;

      const aggregateId = uuid(),
            committedEvents = [ eventStarted ];

      const middleware = publishEvents({
        eventbus: {
          outgoing: {
            write () {}
          }
        },
        flowbus: {
          outgoing: {
            write () {}
          }
        },
        eventStore: {
          markEventsAsPublished (options, callback) {
            callback(null);
          }
        }
      });

      middleware(aggregateId, committedEvents, err => {
        assert.that(err).is.null();
        done();
      });
    });
  });
});

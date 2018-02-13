'use strict';

const assert = require('assertthat'),
      uuid = require('uuidv4');

const buildEvent = require('../../helpers/buildEvent'),
      publishEvents = require('../../../appLogic/publishEvents');

suite('publishEvents', () => {
  test('is a function.', async () => {
    assert.that(publishEvents).is.ofType('function');
  });

  test('throws an error if event bus is missing.', async () => {
    await assert.that(async () => {
      await publishEvents({});
    }).is.throwingAsync('Event bus is missing.');
  });

  test('throws an error if flow bus is missing.', async () => {
    await assert.that(async () => {
      await publishEvents({
        eventbus: {}
      });
    }).is.throwingAsync('Flow bus is missing.');
  });

  test('throws an error if event store is missing.', async () => {
    await assert.that(async () => {
      await publishEvents({
        eventbus: {},
        flowbus: {}
      });
    }).is.throwingAsync('Event store is missing.');
  });

  test('throws an error if aggregate id is missing.', async () => {
    await assert.that(async () => {
      await publishEvents({
        eventbus: {},
        flowbus: {},
        eventStore: {}
      });
    }).is.throwingAsync('Aggregate id is missing.');
  });

  test('throws an error if committed events are missing.', async () => {
    await assert.that(async () => {
      await publishEvents({
        eventbus: {},
        flowbus: {},
        eventStore: {},
        aggregateId: uuid()
      });
    }).is.throwingAsync('Committed events are missing.');
  });

  test('throws an error if publishing to the event bus fails.', async () => {
    const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
      initiator: 'Jane Doe',
      destination: 'Riva',
      participants: []
    });

    eventStarted.metadata.position = 1;

    const aggregateId = uuid(),
          committedEvents = [ eventStarted ];

    await assert.that(async () => {
      await publishEvents({
        eventbus: {
          outgoing: {
            write () {
              throw new Error('Error during write.');
            }
          }
        },
        flowbus: {},
        eventStore: {},
        aggregateId,
        committedEvents
      });
    }).is.throwingAsync('Error during write.');
  });

  test('throws an error if publishing to the flow bus fails.', async () => {
    const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
      initiator: 'Jane Doe',
      destination: 'Riva',
      participants: []
    });

    eventStarted.metadata.position = 1;

    const aggregateId = uuid(),
          committedEvents = [ eventStarted ];

    await assert.that(async () => {
      await publishEvents({
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
        eventStore: {},
        aggregateId,
        committedEvents
      });
    }).is.throwingAsync('Error during write.');
  });

  test('throws an error if marking published events fails.', async () => {
    const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
      initiator: 'Jane Doe',
      destination: 'Riva',
      participants: []
    });

    eventStarted.metadata.position = 1;

    const aggregateId = uuid();
    const committedEvents = [ eventStarted ];

    await assert.that(async () => {
      await publishEvents({
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
          async markEventsAsPublished () {
            throw new Error('Marking events failed.');
          }
        },
        aggregateId,
        committedEvents
      });
    }).is.throwingAsync('Marking events failed.');
  });

  test('does not throw an error if publishing and marking events succeeds.', async () => {
    const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
      initiator: 'Jane Doe',
      destination: 'Riva',
      participants: []
    });

    eventStarted.metadata.position = 1;

    const aggregateId = uuid(),
          committedEvents = [ eventStarted ];

    await assert.that(async () => {
      await publishEvents({
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
          async markEventsAsPublished () {
            // Intentionally left blank.
          }
        },
        aggregateId,
        committedEvents
      });
    }).is.not.throwingAsync();
  });
});

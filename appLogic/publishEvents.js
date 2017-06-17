'use strict';

const publishEvents = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.eventbus) {
    throw new Error('Event bus is missing.');
  }
  if (!options.flowbus) {
    throw new Error('Flow bus is missing.');
  }
  if (!options.eventStore) {
    throw new Error('Event store is missing.');
  }

  return function (aggregateId, committedEvents, callback) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    for (let i = 0; i < committedEvents.length; i++) {
      const event = committedEvents[i];

      try {
        options.eventbus.outgoing.write(event);
        options.flowbus.outgoing.write(event);
      } catch (err) {
        /* eslint-disable no-loop-func */
        return process.nextTick(() => callback(err));
        /* eslint-enable no-loop-func */
      }
    }

    if (committedEvents.length === 0) {
      return callback(null);
    }

    const lastEventIndex = committedEvents.length - 1;

    options.eventStore.markEventsAsPublished({
      aggregateId,
      fromRevision: committedEvents[0].metadata.revision,
      toRevision: committedEvents[lastEventIndex].metadata.revision
    }, callback);
  };
};

module.exports = publishEvents;

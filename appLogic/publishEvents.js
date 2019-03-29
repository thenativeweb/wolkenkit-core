'use strict';

const publishEvents = async function ({ eventbus, flowbus, eventStore, aggregateId, committedEvents }) {
  if (!eventbus) {
    throw new Error('Event bus is missing.');
  }
  if (!flowbus) {
    throw new Error('Flow bus is missing.');
  }
  if (!eventStore) {
    throw new Error('Event store is missing.');
  }
  if (!aggregateId) {
    throw new Error('Aggregate id is missing.');
  }
  if (!committedEvents) {
    throw new Error('Committed events are missing.');
  }

  if (committedEvents.length === 0) {
    return;
  }

  for (let i = 0; i < committedEvents.length; i++) {
    const { event, previousState, state } = committedEvents[i];

    eventbus.outgoing.write({ event, metadata: { previousState, state }});
    flowbus.outgoing.write({ event, metadata: { previousState, state }});
  }

  const lastEventIndex = committedEvents.length - 1;

  await eventStore.markEventsAsPublished({
    aggregateId,
    fromRevision: committedEvents[0].event.metadata.revision,
    toRevision: committedEvents[lastEventIndex].event.metadata.revision
  });
};

module.exports = publishEvents;

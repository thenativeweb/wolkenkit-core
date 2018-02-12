'use strict';

const initializeOwnership = async function ({ aggregate, command }) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!command) {
    throw new Error('Command is missing.');
  }

  if (aggregate.api.forCommands.exists()) {
    return;
  }

  aggregate.api.forCommands.events.publish('transferredOwnership', {
    to: command.user.id
  });

  aggregate.definition.events.transferredOwnership(
    aggregate.api.forEvents,
    aggregate.instance.uncommittedEvents[0]
  );
};

module.exports = initializeOwnership;

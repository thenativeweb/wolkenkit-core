'use strict';

const initializeOwnership = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!options.command) {
    throw new Error('Command is missing.');
  }

  return function (callback) {
    if (options.aggregate.api.forCommands.exists()) {
      return callback(null);
    }

    options.aggregate.api.forCommands.events.publish('transferredOwnership', {
      to: options.command.user.id
    });

    options.aggregate.definition.events.transferredOwnership(
      options.aggregate.api.forEvents,
      options.aggregate.instance.uncommittedEvents[0]
    );

    callback(null);
  };
};

module.exports = initializeOwnership;

'use strict';

const handleCommand = async function ({ command, commandHandler, aggregate }) {
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!commandHandler) {
    throw new Error('Command handler is missing.');
  }
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }

  await commandHandler.handle({ command, aggregate });
};

module.exports = handleCommand;

'use strict';

const errors = require('../errors');

const process = async function ({ command, steps, aggregate }) {
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!steps) {
    throw new Error('Steps are missing.');
  }
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      await step({ command, aggregate });
    }
  } catch (ex) {
    throw new errors.CommandRejected(ex.message);
  }
};

module.exports = process;

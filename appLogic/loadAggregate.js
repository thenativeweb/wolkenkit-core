'use strict';

const loadAggregate = async function ({ command, repository }) {
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!repository) {
    throw new Error('Repository is missing.');
  }

  const aggregate = await repository.loadAggregateFor(command);

  return aggregate;
};

module.exports = loadAggregate;

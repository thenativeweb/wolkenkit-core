'use strict';

const saveAggregate = async function ({ aggregate, repository }) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!repository) {
    throw new Error('Repository is missing.');
  }

  const committedEvents = await repository.saveAggregate(aggregate);

  return committedEvents;
};

module.exports = saveAggregate;

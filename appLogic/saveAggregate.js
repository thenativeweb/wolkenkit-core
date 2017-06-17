'use strict';

const saveAggregate = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.repository) {
    throw new Error('Repository is missing.');
  }

  return function (aggregate, callback) {
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }
    if (!callback) {
      throw new Error('Callback is missing.');
    }

    options.repository.saveAggregate(aggregate, (err, committedEvents) => {
      if (err) {
        return callback(err);
      }
      callback(null, aggregate, committedEvents);
    });
  };
};

module.exports = saveAggregate;

'use strict';

const App = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.repository) {
    throw new Error('Repository is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
  }

  Object.keys(options.writeModel).forEach(contextName => {
    this[contextName] = {};

    Object.keys(options.writeModel[contextName]).forEach(aggregateName => {
      this[contextName][aggregateName] = function (aggregateId) {
        return {
          read (callback) {
            options.repository.loadAggregate({
              context: { name: contextName },
              aggregate: { name: aggregateName, id: aggregateId }
            }, (err, aggregate) => {
              if (err) {
                return callback(err);
              }

              if (!aggregate.api.forReadOnly.exists()) {
                return callback(new Error('Aggregate not found.'));
              }
              callback(null, aggregate.api.forReadOnly);
            });
          }
        };
      };
    });
  });
};

module.exports = App;

'use strict';

const memoize = require('lodash/memoize');

const getApp = function ({ repository, writeModel }) {
  if (!repository) {
    throw new Error('Repository is missing.');
  }
  if (!writeModel) {
    throw new Error('Write model is missing.');
  }

  const app = {};

  Object.keys(writeModel).forEach(contextName => {
    app[contextName] = {};

    Object.keys(writeModel[contextName]).forEach(aggregateName => {
      app[contextName][aggregateName] = function (aggregateId) {
        return {
          async read () {
            const aggregate = await repository.loadAggregate({
              context: { name: contextName },
              aggregate: { name: aggregateName, id: aggregateId }
            });

            if (!aggregate.api.forReadOnly.exists()) {
              throw new Error('Aggregate not found.');
            }

            return aggregate.api.forReadOnly;
          }
        };
      };
    });
  });

  return app;
};

module.exports = memoize(getApp);

'use strict';

class App {
  constructor ({ repository, writeModel }) {
    if (!repository) {
      throw new Error('Repository is missing.');
    }
    if (!writeModel) {
      throw new Error('Write model is missing.');
    }

    Object.keys(writeModel).forEach(contextName => {
      this[contextName] = {};

      Object.keys(writeModel[contextName]).forEach(aggregateName => {
        this[contextName][aggregateName] = function (aggregateId) {
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
  }
}

module.exports = App;

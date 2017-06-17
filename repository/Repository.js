'use strict';

const Aggregate = require('./Aggregate');

const Repository = function () {
  // Initialization is done by the initialize function.
};

Repository.prototype.initialize = function (options, callback) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.app) {
    throw new Error('App is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
  }
  if (!options.eventStore) {
    throw new Error('Event store is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  this.app = options.app;
  this.logger = options.app.services.getLogger();
  this.writeModel = options.writeModel;
  this.eventStore = options.eventStore;

  callback(null);
};

Repository.prototype.saveSnapshotFor = function (aggregate, callback) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  this.eventStore.saveSnapshot({
    aggregateId: aggregate.instance.id,
    state: aggregate.api.forReadOnly.state,
    revision: aggregate.instance.revision
  }, err => {
    if (err) {
      return callback(err);
    }
    callback(null);
  });
};

Repository.prototype.replayAggregate = function (aggregate, callback) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  this.eventStore.getSnapshot(aggregate.instance.id, (errGetSnapshot, snapshot) => {
    if (errGetSnapshot) {
      return callback(errGetSnapshot);
    }

    let fromRevision = 1;

    if (snapshot) {
      aggregate.applySnapshot(snapshot);
      fromRevision = snapshot.revision + 1;
    }

    this.eventStore.getEventStream(aggregate.instance.id, { fromRevision }, (errGetEventStream, eventStream) => {
      if (errGetEventStream) {
        return callback(errGetEventStream);
      }

      let onData,
          onEnd,
          onError;

      const unsubscribe = function () {
        eventStream.removeListener('data', onData);
        eventStream.removeListener('end', onEnd);
        eventStream.removeListener('error', onError);
      };

      onData = event => {
        try {
          aggregate.definition.events[event.name](aggregate.api.forEvents, event);
        } catch (ex) {
          unsubscribe();
          eventStream.resume();

          return callback(ex);
        }
        aggregate.instance.revision = event.metadata.revision;
      };

      onEnd = () => {
        unsubscribe();

        if ((aggregate.instance.revision - fromRevision) >= 100) {
          process.nextTick(() => {
            this.saveSnapshotFor(aggregate, err => {
              if (err) {
                this.logger.error('Failed to save snapshot.', err);
              }
            });
          });
        }

        callback(null, aggregate);
      };

      onError = err => {
        unsubscribe();
        callback(err);
      };

      eventStream.on('data', onData);
      eventStream.on('end', onEnd);
      eventStream.on('error', onError);
    });
  });
};

Repository.prototype.loadAggregate = function (options, callback) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.context) {
    throw new Error('Context is missing.');
  }
  if (!options.context.name) {
    throw new Error('Context name is missing.');
  }
  if (!options.aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!options.aggregate.name) {
    throw new Error('Aggregate name is missing.');
  }
  if (!options.aggregate.id) {
    throw new Error('Aggregate id is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  const aggregate = new Aggregate.Readable({
    app: this.app,
    writeModel: this.writeModel,
    context: options.context,
    aggregate: options.aggregate
  });

  this.replayAggregate(aggregate, callback);
};

Repository.prototype.loadAggregateFor = function (command, callback) {
  if (!command) {
    throw new Error('Command is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  const aggregate = new Aggregate.Writable({
    app: this.app,
    writeModel: this.writeModel,
    context: { name: command.context.name },
    aggregate: { name: command.aggregate.name, id: command.aggregate.id },
    command
  });

  this.replayAggregate(aggregate, callback);
};

Repository.prototype.saveAggregate = function (aggregate, callback) {
  if (!aggregate) {
    throw new Error('Aggregate is missing.');
  }
  if (!callback) {
    throw new Error('Callback is missing.');
  }

  if (aggregate.instance.uncommittedEvents.length === 0) {
    return process.nextTick(() => callback(null));
  }

  this.eventStore.saveEvents({
    events: aggregate.instance.uncommittedEvents
  }, (err, committedEvents) => {
    if (err) {
      return callback(err);
    }
    callback(null, committedEvents);
  });
};

module.exports = Repository;

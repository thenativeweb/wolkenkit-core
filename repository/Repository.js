'use strict';

const Aggregate = require('./Aggregate');

class Repository {
  initialize ({ app, writeModel, eventStore }) {
    if (!app) {
      throw new Error('App is missing.');
    }
    if (!writeModel) {
      throw new Error('Write model is missing.');
    }
    if (!eventStore) {
      throw new Error('Event store is missing.');
    }

    this.app = app;
    this.logger = app.services.getLogger();
    this.writeModel = writeModel;
    this.eventStore = eventStore;
  }

  async replayAggregate (aggregate) {
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }

    const snapshot = await this.eventStore.getSnapshot(aggregate.instance.id);

    let fromRevision = 1;

    if (snapshot) {
      aggregate.applySnapshot(snapshot);
      fromRevision = snapshot.revision + 1;
    }

    const eventStream = await this.eventStore.getEventStream({
      aggregateId: aggregate.instance.id,
      fromRevision
    });

    for await (const event of eventStream) {
      if (!aggregate.definition.events[event.name]) {
        throw new Error('Aggregate not found.');
      }

      aggregate.definition.events[event.name](aggregate.api.forEvents, event);
      aggregate.instance.revision = event.metadata.revision;
    }

    return aggregate;
  }

  async loadAggregate ({ context, aggregate }) {
    if (!context) {
      throw new Error('Context is missing.');
    }
    if (!context.name) {
      throw new Error('Context name is missing.');
    }
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }
    if (!aggregate.name) {
      throw new Error('Aggregate name is missing.');
    }
    if (!aggregate.id) {
      throw new Error('Aggregate id is missing.');
    }

    const newAggregate = new Aggregate.Readable({
      app: this.app,
      writeModel: this.writeModel,
      context,
      aggregate
    });

    const loadedAggregate = await this.replayAggregate(newAggregate);

    return loadedAggregate;
  }

  async loadAggregateFor (command) {
    if (!command) {
      throw new Error('Command is missing.');
    }

    const newAggregate = new Aggregate.Writable({
      app: this.app,
      writeModel: this.writeModel,
      context: { name: command.context.name },
      aggregate: { name: command.aggregate.name, id: command.aggregate.id },
      command
    });

    const loadedAggregate = await this.replayAggregate(newAggregate);

    return loadedAggregate;
  }

  async saveAggregate (aggregate) {
    if (!aggregate) {
      throw new Error('Aggregate is missing.');
    }

    if (aggregate.instance.uncommittedEvents.length === 0) {
      return [];
    }

    const committedEvents = await this.eventStore.saveEvents({
      uncommittedEvents: aggregate.instance.uncommittedEvents
    });

    return committedEvents;
  }
}

module.exports = Repository;

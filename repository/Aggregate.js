'use strict';

const cloneDeep = require('lodash/cloneDeep');

class Readable {
  constructor ({ writeModel, context, aggregate }) {
    if (!writeModel) {
      throw new Error('Write model is missing.');
    }
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

    if (!writeModel[context.name]) {
      throw new Error('Context does not exist.');
    }
    if (!writeModel[context.name][aggregate.name]) {
      throw new Error('Aggregate does not exist.');
    }

    this.definition = writeModel[context.name][aggregate.name];

    this.instance = {};
    this.instance.id = aggregate.id;
    this.instance.revision = 0;
    this.instance.uncommittedEvents = [];
    this.instance.exists = () =>
      this.instance.revision > 0;

    this.api = {};
    this.api.forReadOnly = {};
    this.api.forReadOnly.id = aggregate.id;
    this.api.forReadOnly.state = cloneDeep(this.definition.initialState);
    this.api.forReadOnly.exists = this.instance.exists;

    this.api.forEvents = {};
    this.api.forEvents.id = this.api.forReadOnly.id;
    this.api.forEvents.state = this.api.forReadOnly.state;
    this.api.forEvents.setState = newState => {
      for (const [ key, value ] of Object.entries(newState)) {
        this.api.forEvents.state[key] = value;
      }
    };
  }

  applySnapshot (snapshot) {
    if (!snapshot) {
      throw new Error('Snapshot is missing.');
    }

    this.instance.revision = snapshot.revision;
    this.api.forReadOnly.state = snapshot.state;
    this.api.forEvents.state = snapshot.state;
  }
}

class Writable extends Readable {
  constructor ({ app, writeModel, context, aggregate, command }) {
    if (!app) {
      throw new Error('App is missing.');
    }
    if (!writeModel) {
      throw new Error('Write model is missing.');
    }
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
    if (!command) {
      throw new Error('Command is missing.');
    }

    super({ writeModel, context, aggregate });

    this.api.forCommands = {};
    this.api.forCommands.id = aggregate.id;
    this.api.forCommands.state = this.api.forReadOnly.state;
    this.api.forCommands.exists = this.api.forReadOnly.exists;

    this.api.forCommands.events = {};
    this.api.forCommands.events.publish = (eventName, data) => {
      if (!eventName) {
        throw new Error('Event name is missing.');
      }
      if (!this.definition.events[eventName]) {
        throw new Error('Unknown event.');
      }

      const event = new app.Event({
        context: { name: context.name },
        aggregate: { name: aggregate.name, id: aggregate.id },
        name: eventName,
        data,
        metadata: {
          correlationId: command.metadata.correlationId,
          causationId: command.id
        }
      });

      event.addInitiator(command.initiator);
      event.metadata.revision = this.instance.revision + this.instance.uncommittedEvents.length + 1;

      const previousState = cloneDeep(this.api.forCommands.state);

      this.definition.events[event.name](this.api.forEvents, event);

      const state = cloneDeep(this.api.forCommands.state);

      this.instance.uncommittedEvents.push({ event, previousState, state });
    };
  }

  applySnapshot (snapshot) {
    super.applySnapshot(snapshot);
    this.api.forCommands.state = snapshot.state;
  }
}

module.exports = { Readable, Writable };

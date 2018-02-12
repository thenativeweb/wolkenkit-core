'use strict';

const cloneDeep = require('lodash/cloneDeep'),
      difference = require('lodash/difference'),
      isBoolean = require('lodash/isBoolean'),
      isObject = require('lodash/isObject'),
      merge = require('lodash/merge'),
      { toStudlyCaps } = require('strman');

const validAuthorizationOptionNames = [ 'forAuthenticated', 'forPublic' ];

const validate = function (objectToAuthorize, objectToAuthorizeAgainst, objectType) {
  const propertyNamesToAuthorize = Object.keys(objectToAuthorize);

  if (propertyNamesToAuthorize.length === 0) {
    throw new Error(`${toStudlyCaps(objectType)} is missing.`);
  }

  const validPropertyNames = Object.keys(objectToAuthorizeAgainst);
  const invalidPropertyNames = difference(propertyNamesToAuthorize, validPropertyNames);

  if (invalidPropertyNames.length > 0) {
    throw new Error(`Unknown ${objectType}.`);
  }

  for (let i = 0; i < propertyNamesToAuthorize.length; i++) {
    const propertyNameToAuthorize = propertyNamesToAuthorize[i];
    const authorizationOptions = objectToAuthorize[propertyNameToAuthorize];
    const authorizationOptionNames = Object.keys(authorizationOptions);
    const invalidAuthorizationOptionNames = difference(authorizationOptionNames, validAuthorizationOptionNames);

    if (invalidAuthorizationOptionNames.length > 0) {
      throw new Error('Unknown authorization option.');
    }
    if (authorizationOptionNames.length === 0) {
      throw new Error('Missing authorization options.');
    }

    for (let j = 0; j < authorizationOptionNames.length; j++) {
      const authorizationOptionName = authorizationOptionNames[j];
      const authorizationOption = authorizationOptions[authorizationOptionName];

      if (!isBoolean(authorizationOption)) {
        throw new Error('Invalid authorization option.');
      }
    }
  }
};

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
    this.api.forReadOnly.state = cloneDeep(this.definition.initialState);
    this.api.forReadOnly.exists = this.instance.exists;

    this.api.forEvents = {};
    this.api.forEvents.state = this.api.forReadOnly.state;
    this.api.forEvents.setState = newState => {
      merge(this.api.forEvents.state, newState);
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
          causationId: command.id,
          isAuthorized: {
            owner: this.api.forCommands.state.isAuthorized.owner || command.user.id,
            forAuthenticated: this.api.forCommands.state.isAuthorized.events[eventName].forAuthenticated || false,
            forPublic: this.api.forCommands.state.isAuthorized.events[eventName].forPublic || false
          }
        }
      });

      event.addUser(command.user);
      event.metadata.revision = this.instance.revision + this.instance.uncommittedEvents.length + 1;

      this.definition.events[event.name](this.api.forEvents, event);
      this.instance.uncommittedEvents.push(event);
    };

    this.api.forCommands.transferOwnership = data => {
      if (!data) {
        throw new Error('Data is missing.');
      }
      if (!data.to) {
        throw new Error('Owner is missing.');
      }
      if (data.to === this.api.forCommands.state.isAuthorized.owner) {
        throw new Error('Could not transfer ownership to current owner.');
      }

      this.api.forCommands.events.publish('transferredOwnership', {
        from: this.api.forCommands.state.isAuthorized.owner,
        to: data.to
      });
    };

    this.api.forCommands.authorize = data => {
      if (!data) {
        throw new Error('Data is missing.');
      }

      const commandsToAuthorize = data.commands,
            eventsToAuthorize = data.events;

      if (!isObject(commandsToAuthorize) && !isObject(eventsToAuthorize)) {
        throw new Error('Commands and events are missing.');
      }
      if (commandsToAuthorize) {
        validate(commandsToAuthorize, this.definition.commands, 'command');
      }
      if (eventsToAuthorize) {
        validate(eventsToAuthorize, this.definition.events, 'event');
      }

      this.api.forCommands.events.publish('authorized', data);
    };
  }

  applySnapshot (snapshot) {
    super.applySnapshot(snapshot);
    this.api.forCommands.state = snapshot.state;
  }
}

module.exports = { Readable, Writable };

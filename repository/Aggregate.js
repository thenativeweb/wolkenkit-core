'use strict';

const util = require('util');

const _ = require('lodash'),
      toStudlyCaps = require('strman').toStudlyCaps;

const validAuthorizationOptionNames = [ 'forAuthenticated', 'forPublic' ];

const validate = function (objectToAuthorize, objectToAuthorizeAgainst, objectType) {
  const propertyNamesToAuthorize = Object.keys(objectToAuthorize);

  if (propertyNamesToAuthorize.length === 0) {
    throw new Error(`${toStudlyCaps(objectType)} is missing.`);
  }

  const validPropertyNames = Object.keys(objectToAuthorizeAgainst);
  const invalidPropertyNames = _.difference(propertyNamesToAuthorize, validPropertyNames);

  if (invalidPropertyNames.length > 0) {
    throw new Error(`Unknown ${objectType}.`);
  }

  for (let i = 0; i < propertyNamesToAuthorize.length; i++) {
    const propertyNameToAuthorize = propertyNamesToAuthorize[i];
    const authorizationOptions = objectToAuthorize[propertyNameToAuthorize];
    const authorizationOptionNames = Object.keys(authorizationOptions);
    const invalidAuthorizationOptionNames = _.difference(authorizationOptionNames, validAuthorizationOptionNames);

    if (invalidAuthorizationOptionNames.length > 0) {
      throw new Error('Unknown authorization option.');
    }
    if (authorizationOptionNames.length === 0) {
      throw new Error('Missing authorization options.');
    }

    for (let j = 0; j < authorizationOptionNames.length; j++) {
      const authorizationOptionName = authorizationOptionNames[j];
      const authorizationOption = authorizationOptions[authorizationOptionName];

      if (!_.isBoolean(authorizationOption)) {
        throw new Error('Invalid authorization option.');
      }
    }
  }
};

const Readable = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
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

  if (!options.writeModel[options.context.name]) {
    throw new Error('Context does not exist.');
  }
  if (!options.writeModel[options.context.name][options.aggregate.name]) {
    throw new Error('Aggregate does not exist.');
  }

  this.definition = options.writeModel[options.context.name][options.aggregate.name];

  this.instance = {};
  this.instance.id = options.aggregate.id;
  this.instance.revision = 0;
  this.instance.uncommittedEvents = [];
  this.instance.exists = () =>
    this.instance.revision > 0;

  this.api = {};
  this.api.forReadOnly = {};
  this.api.forReadOnly.state = _.cloneDeep(this.definition.initialState);
  this.api.forReadOnly.exists = this.instance.exists;

  this.api.forEvents = {};
  this.api.forEvents.state = this.api.forReadOnly.state;
  this.api.forEvents.setState = newState => {
    _.merge(this.api.forEvents.state, newState);
  };
};

Readable.prototype.applySnapshot = function (snapshot) {
  if (!snapshot) {
    throw new Error('Snapshot is missing.');
  }

  this.instance.revision = snapshot.revision;
  this.api.forReadOnly.state = snapshot.state;
  this.api.forEvents.state = snapshot.state;
};

const Writable = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }
  if (!options.app) {
    throw new Error('App is missing.');
  }
  if (!options.writeModel) {
    throw new Error('Write model is missing.');
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
  if (!options.command) {
    throw new Error('Command is missing.');
  }

  Reflect.apply(Readable, this, [ options ]);

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

    const event = new options.app.Event({
      context: { name: options.context.name },
      aggregate: { name: options.aggregate.name, id: options.aggregate.id },
      name: eventName,
      data,
      metadata: {
        correlationId: options.command.metadata.correlationId,
        causationId: options.command.id,
        isAuthorized: {
          owner: this.api.forCommands.state.isAuthorized.owner || options.command.user.id,
          forAuthenticated: this.api.forCommands.state.isAuthorized.events[eventName].forAuthenticated || false,
          forPublic: this.api.forCommands.state.isAuthorized.events[eventName].forPublic || false
        }
      }
    });

    event.addUser(options.command.user);
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

    if (!_.isObject(commandsToAuthorize) && !_.isObject(eventsToAuthorize)) {
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
};

util.inherits(Writable, Readable);

Writable.prototype.applySnapshot = function (snapshot) {
  Reflect.apply(Readable.prototype.applySnapshot, this, [ snapshot ]);
  this.api.forCommands.state = snapshot.state;
};

module.exports = { Readable, Writable };

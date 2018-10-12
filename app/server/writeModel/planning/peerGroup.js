'use strict';

const { only } = require('wolkenkit-command-tools');

const wasAlreadyJoinedBy = function (peerGroup, participant) {
  return peerGroup.state.participants.indexOf(participant) !== -1;
};

const initialState = {
  initiator: undefined,
  destination: undefined,
  participants: [],
  isAuthorized: {
    commands: {
      start: { forPublic: true },
      startForOwner: { forAuthenticated: false, forPublic: false },
      startForAuthenticated: { forAuthenticated: true, forPublic: false },
      join: { forPublic: true },
      joinAndFail: { forPublic: true },
      joinOnlyForOwner: { forAuthenticated: false, forPublic: false },
      joinOnlyForAuthenticated: { forAuthenticated: true, forPublic: false },
      joinForPublic: { forAuthenticated: true, forPublic: true },
      joinWithFailingMiddleware: { forAuthenticated: true, forPublic: false },
      joinWithRejectingMiddleware: { forAuthenticated: true, forPublic: false },
      joinWithPassingMiddleware: { forAuthenticated: true, forPublic: false },
      requestServices: { forAuthenticated: true, forPublic: false },
      requestNonExistentService: { forAuthenticated: true, forPublic: false },
      useLoggerService: { forAuthenticated: true, forPublic: false },
      loadOtherAggregate: { forAuthenticated: true, forPublic: false },
      triggerImmediateCommand: { forAuthenticated: true, forPublic: false },
      triggerLongRunningCommand: { forAuthenticated: true, forPublic: false }
    },
    events: {
      started: { forPublic: true },
      joined: { forPublic: true },
      loadedOtherAggregate: { forAuthenticated: true, forPublic: false },
      joinedOnlyForOwner: { forAuthenticated: false, forPublic: false },
      joinedOnlyForAuthenticated: { forAuthenticated: true, forPublic: false },
      joinedForPublic: { forAuthenticated: true, forPublic: true },
      finishedImmediateCommand: { forAuthenticated: true, forPublic: true },
      finishedLongRunningCommand: { forAuthenticated: true, forPublic: true }
    }
  }
};

const commands = {
  start: [
    only.ifNotExists(),
    (peerGroup, command) => {
      peerGroup.events.publish('started', {
        initiator: command.data.initiator,
        destination: command.data.destination
      });

      peerGroup.events.publish('joined', {
        participant: command.data.initiator
      });
    }
  ],

  join: [
    only.ifExists(),
    (peerGroup, command) => {
      if (wasAlreadyJoinedBy(peerGroup, command.data.participant)) {
        return command.reject('Participant had already joined.');
      }

      peerGroup.events.publish('joined', {
        participant: command.data.participant
      });
    }
  ],

  joinAndFail () {
    throw new Error('Something, somewhere went horribly wrong...');
  },

  joinOnlyForOwner (peerGroup) {
    peerGroup.events.publish('joinedOnlyForOwner');
  },

  joinOnlyForAuthenticated (peerGroup) {
    peerGroup.events.publish('joinedOnlyForAuthenticated');
  },

  joinForPublic (peerGroup) {
    peerGroup.events.publish('joinedForPublic');
  },

  joinWithFailingMiddleware: [
    () => {
      throw new Error('Failed in middleware.');
    },
    () => {
      throw new Error('Invalid operation.');
    }
  ],

  joinWithRejectingMiddleware: [
    (peerGroup, command) => {
      command.reject('Rejected by middleware.');
    },
    () => {
      throw new Error('Invalid operation.');
    }
  ],

  joinWithPassingMiddleware: [
    () => {
      // Intentionally left blank.
    },
    () => {
      // Intentionally left blank.
    }
  ],

  requestServices (peerGroup, command, services) {
    if (typeof services !== 'object') {
      return command.reject('Services are missing.');
    }
  },

  requestNonExistentService (peerGroup, command, { nonExistentService }) {
    nonExistentService.run();
  },

  useLoggerService (peerGroup, command, { logger }) {
    logger.info('Some message from useLoggerService command.');
  },

  async loadOtherAggregate (peerGroup, command, { app }) {
    let otherPeerGroup;

    try {
      otherPeerGroup = await app.planning.peerGroup(command.data.otherAggregateId).read();
    } catch (ex) {
      return command.reject(ex.message);
    }

    peerGroup.events.publish('loadedOtherAggregate', otherPeerGroup.state);
  },

  triggerImmediateCommand (peerGroup) {
    peerGroup.events.publish('finishedImmediateCommand');
  },

  async triggerLongRunningCommand (peerGroup, command) {
    await new Promise(resolve => {
      setTimeout(resolve, command.data.duration);
    });

    peerGroup.events.publish('finishedLongRunningCommand');
  }
};

const events = {
  started (peerGroup, event) {
    peerGroup.setState({
      initiator: event.data.initiator,
      destination: event.data.destination
    });
  },

  joined (peerGroup, event) {
    peerGroup.state.participants.push(event.data.participant);
  },

  loadedOtherAggregate () {},

  joinedOnlyForOwner () {},

  joinedOnlyForAuthenticated () {},

  joinedForPublic () {},

  finishedImmediateCommand () {},

  finishedLongRunningCommand () {}
};

module.exports = { initialState, commands, events };

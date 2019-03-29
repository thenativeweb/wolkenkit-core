'use strict';

const {
  forAuthenticated,
  forOwner,
  forPublic,
  reject,
  transferOwnership,
  withOwnership
} = require('wolkenkit-application-tools');

const wasAlreadyJoinedBy = function (peerGroup, participant) {
  return peerGroup.state.participants.includes(participant);
};

const initialState = {
  initiator: undefined,
  destination: undefined,
  participants: [],
  isAuthorized: {
    events: {
      started: { forPublic: true },
      validatedAggregateApi: { forPublic: true },
      joined: { forPublic: true },
      loadedOtherAggregate: { forAuthenticated: true, forPublic: true },
      joinedOnlyForOwner: { forAuthenticated: false, forPublic: false },
      joinedOnlyForAuthenticated: { forAuthenticated: true, forPublic: false },
      joinedForPublic: { forAuthenticated: true, forPublic: true },
      finishedImmediateCommand: { forAuthenticated: true, forPublic: true },
      finishedLongRunningCommand: { forAuthenticated: true, forPublic: true }
    }
  }
};

const commands = {
  start: {
    isAuthorized: forPublic(),

    handle (peerGroup, command) {
      reject(command).if(peerGroup).exists();

      transferOwnership(peerGroup, { to: command.initiator.id });

      peerGroup.events.publish('started', {
        initiator: command.data.initiator,
        destination: command.data.destination
      });

      peerGroup.events.publish('joined', {
        participant: command.data.initiator
      });
    }
  },

  startForOwner: {
    isAuthorized: forOwner(),

    handle () {}
  },

  startForAuthenticated: {
    isAuthorized: forAuthenticated(),

    handle () {}
  },

  validateAggregateApi: {
    isAuthorized: forPublic(),

    handle (peerGroup, command) {
      reject(command).if(peerGroup).doesNotExist();

      if (!peerGroup.id) {
        throw new Error('Id is missing.');
      }
      if (!peerGroup.state) {
        throw new Error('State is missing.');
      }
      if (!peerGroup.events) {
        throw new Error('Events are missing.');
      }
      if (!peerGroup.events.publish) {
        throw new Error('Events publish is missing.');
      }

      const { id } = peerGroup;

      peerGroup.events.publish('validatedAggregateApi', { id });
    }
  },

  join: {
    isAuthorized: forPublic(),

    handle (peerGroup, command) {
      reject(command).if(peerGroup).doesNotExist();

      if (wasAlreadyJoinedBy(peerGroup, command.data.participant)) {
        return command.reject('Participant had already joined.');
      }

      peerGroup.events.publish('joined', {
        participant: command.data.participant
      });
    }
  },

  joinAndFail: {
    isAuthorized: forPublic(),

    handle () {
      throw new Error('Something, somewhere went horribly wrong...');
    }
  },

  joinOnlyForOwner: {
    isAuthorized: forOwner(),

    handle (peerGroup) {
      peerGroup.events.publish('joinedOnlyForOwner');
    }
  },

  joinOnlyForAuthenticated: {
    isAuthorized: forAuthenticated(),

    handle (peerGroup) {
      peerGroup.events.publish('joinedOnlyForAuthenticated');
    }
  },

  joinForPublic: {
    isAuthorized: forPublic(),

    handle (peerGroup) {
      peerGroup.events.publish('joinedForPublic');
    }
  },

  requestServices: {
    isAuthorized: forPublic(),

    handle (peerGroup, command, services) {
      if (typeof services !== 'object') {
        return command.reject('Services are missing.');
      }
    }
  },

  requestNonExistentService: {
    isAuthorized: forPublic(),

    handle (peerGroup, command, { nonExistentService }) {
      nonExistentService.run();
    }
  },

  useLoggerService: {
    isAuthorized: forPublic(),

    handle (peerGroup, command, { logger }) {
      logger.info('Some message from useLoggerService command.');
    }
  },

  loadOtherAggregate: {
    isAuthorized: forPublic(),

    async handle (peerGroup, command, { app }) {
      let otherPeerGroup;

      try {
        otherPeerGroup = await app.planning.peerGroup(command.data.otherAggregateId).read();
      } catch (ex) {
        return command.reject(ex.message);
      }

      peerGroup.events.publish('loadedOtherAggregate', otherPeerGroup.state);
    }
  },

  triggerImmediateCommand: {
    isAuthorized: forPublic(),

    handle (peerGroup) {
      peerGroup.events.publish('finishedImmediateCommand');
    }
  },

  triggerLongRunningCommand: {
    isAuthorized: forPublic(),

    async handle (peerGroup, command) {
      await new Promise(resolve => {
        setTimeout(resolve, command.data.duration);
      });

      peerGroup.events.publish('finishedLongRunningCommand');
    }
  }
};

const events = {
  started (peerGroup, event) {
    peerGroup.setState({
      initiator: event.data.initiator,
      destination: event.data.destination
    });
  },

  validatedAggregateApi (peerGroup, event) {
    if (!peerGroup.id) {
      throw new Error('Id is missing.');
    }
    if (peerGroup.id !== event.data.id) {
      throw new Error('Aggregate ids are not consistent.');
    }
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

module.exports = withOwnership({ initialState, commands, events });

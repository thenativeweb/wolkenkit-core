'use strict';

const only = require('wolkenkit-command-tools').only;

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
      loadOtherAggregate: { forAuthenticated: true, forPublic: false }
    },
    events: {
      started: { forPublic: true },
      joined: { forPublic: true },
      loadedOtherAggregate: { forAuthenticated: true, forPublic: false },
      joinedOnlyForOwner: { forAuthenticated: false, forPublic: false },
      joinedOnlyForAuthenticated: { forAuthenticated: true, forPublic: false },
      joinedForPublic: { forAuthenticated: true, forPublic: true }
    }
  }
};

const commands = {
  start: [
    only.ifNotExists(),
    (peerGroup, command, services, mark) => {
      peerGroup.events.publish('started', {
        initiator: command.data.initiator,
        destination: command.data.destination
      });

      peerGroup.events.publish('joined', {
        participant: command.data.initiator
      });

      mark.asDone();
    }
  ],

  join: [
    only.ifExists(),
    (peerGroup, command, mark) => {
      if (wasAlreadyJoinedBy(peerGroup, command.data.participant)) {
        return mark.asRejected('Participant had already joined.');
      }

      peerGroup.events.publish('joined', {
        participant: command.data.participant
      });

      mark.asDone();
    }
  ],

  joinAndFail () {
    throw new Error('Something, somewhere went horribly wrong...');
  },

  joinOnlyForOwner (peerGroup, command, mark) {
    peerGroup.events.publish('joinedOnlyForOwner');
    mark.asDone();
  },

  joinOnlyForAuthenticated (peerGroup, command, mark) {
    peerGroup.events.publish('joinedOnlyForAuthenticated');
    mark.asDone();
  },

  joinForPublic (peerGroup, command, mark) {
    peerGroup.events.publish('joinedForPublic');
    mark.asDone();
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
    (peerGroup, command, mark) => {
      mark.asRejected('Rejected by middleware.');
    },

    () => {
      throw new Error('Invalid operation.');
    }
  ],

  joinWithPassingMiddleware: [
    (peerGroup, command, mark) => {
      mark.asReadyForNext();
    },

    (peerGroup, command, mark) => {
      mark.asDone();
    }
  ],

  requestServices (peerGroup, command, services, mark) {
    /* eslint-disable prefer-rest-params */
    if (arguments.length !== 4) {
      /* eslint-enable prefer-rest-params */
      return mark.asRejected('Wrong number of arguments.');
    }
    if (typeof services.get !== 'function') {
      return mark.asRejected('Services are missing.');
    }
    mark.asDone();
  },

  /* eslint-disable no-unused-vars */
  requestNonExistentService (peerGroup, command, services, mark) {
    services.get('non-existent-service');
  },
  /* eslint-enable no-unused-vars */

  useLoggerService (peerGroup, command, services, mark) {
    const logger = services.get('logger');

    logger.info('Some message from useLoggerService command.');
    mark.asDone();
  },

  loadOtherAggregate (peerGroup, command, services, mark) {
    const app = services.get('app');

    app.planning.peerGroup(command.data.otherAggregateId).read((err, otherPeerGroup) => {
      if (err) {
        return mark.asRejected(err.message);
      }

      peerGroup.events.publish('loadedOtherAggregate', otherPeerGroup.state);
      mark.asDone();
    });
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

  joinedForPublic () {}
};

module.exports = { initialState, commands, events };

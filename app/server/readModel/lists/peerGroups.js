'use strict';

const fields = {
  initiator: { initialState: '', fastLookup: true, isUnique: false },
  destination: { initialState: '', fastLookup: true },
  participants: { initialState: []},
  authorization: { initialState: { grantedForAuthenticated: true, grantedForPublic: false }}
};

const when = {
  'planning.peerGroup.started': (peerGroups, event, mark) => {
    peerGroups.add({
      initiator: event.data.initiator,
      destination: event.data.destination,
      participants: fields.participants.initialState
    });
    mark.asDone();
  },

  'planning.peerGroup.joined': (peerGroups, event, mark) => {
    peerGroups.update({
      where: { id: event.aggregate.id },
      set: {
        participants: { $add: event.data.participant }
      }
    });
    mark.asDone();
  },

  'planning.peerGroup.left': (peerGroups, event, mark) => {
    peerGroups.update({
      where: { id: event.aggregate.id },
      set: {
        participants: { $remove: event.data.participant }
      }
    });
    mark.asDone();
  }
};

module.exports = { fields, when };

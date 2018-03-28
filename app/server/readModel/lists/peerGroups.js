'use strict';

const fields = {
  initiator: { initialState: '', fastLookup: true, isUnique: false },
  destination: { initialState: '', fastLookup: true },
  participants: { initialState: []},
  authorization: { initialState: { grantedForAuthenticated: true, grantedForPublic: false }}
};

const when = {
  'planning.peerGroup.started' (peerGroups, event) {
    peerGroups.add({
      initiator: event.data.initiator,
      destination: event.data.destination,
      participants: fields.participants.initialState
    });
  },

  'planning.peerGroup.joined' (peerGroups, event) {
    peerGroups.update({
      where: { id: event.aggregate.id },
      set: {
        participants: { $add: event.data.participant }
      }
    });
  },

  'planning.peerGroup.left' (peerGroups, event) {
    peerGroups.update({
      where: { id: event.aggregate.id },
      set: {
        participants: { $remove: event.data.participant }
      }
    });
  }
};

module.exports = { fields, when };

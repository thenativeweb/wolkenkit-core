'use strict';

const assert = require('assertthat'),
      cloneDeep = require('lodash/cloneDeep'),
      uuid = require('uuidv4');

const buildEvent = require('../../helpers/buildEvent'),
      saveAggregate = require('../../../appLogic/saveAggregate');

suite('saveAggregate', () => {
  test('is a function.', async () => {
    assert.that(saveAggregate).is.ofType('function');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await saveAggregate({});
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if repository is missing.', async () => {
    await assert.that(async () => {
      await saveAggregate({ aggregate: {}});
    }).is.throwingAsync('Repository is missing.');
  });

  test('throws an error if the repository fails.', async () => {
    await assert.that(async () => {
      await saveAggregate({
        aggregate: {},
        repository: {
          async saveAggregate () {
            throw new Error('Save failed.');
          }
        }
      });
    }).is.throwingAsync('Save failed.');
  });

  test('returns the committed events if the repository succeeds.', async () => {
    const eventStarted = buildEvent('planning', 'peerGroup', uuid(), 'started', {
      initiator: 'Jane Doe',
      destination: 'Riva',
      participants: []
    });

    const aggregate = {
      instance: {
        id: uuid(),
        uncommittedEvents: [ eventStarted ]
      }
    };

    const committedEventsAfterSave = await saveAggregate({
      aggregate,
      repository: {
        async saveAggregate (receivedAggregate) {
          assert.that(receivedAggregate).is.sameAs(aggregate);

          const committedEvents = cloneDeep(receivedAggregate.instance.uncommittedEvents);

          return committedEvents;
        }
      }
    });

    assert.that(committedEventsAfterSave.length).is.equalTo(1);
    assert.that(committedEventsAfterSave).is.not.sameAs(aggregate.instance.uncommittedEvents);
    assert.that(committedEventsAfterSave[0]).is.not.sameAs(aggregate.instance.uncommittedEvents[0]);
    assert.that(committedEventsAfterSave[0].name).is.equalTo(aggregate.instance.uncommittedEvents[0].name);
  });
});

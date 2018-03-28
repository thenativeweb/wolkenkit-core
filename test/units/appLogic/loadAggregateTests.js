'use strict';

const assert = require('assertthat');

const loadAggregate = require('../../../appLogic/loadAggregate');

suite('loadAggregate', () => {
  test('is a function.', async () => {
    assert.that(loadAggregate).is.ofType('function');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await loadAggregate({});
    }).is.throwingAsync('Command is missing.');
  });

  test('throws an error if repository is missing.', async () => {
    await assert.that(async () => {
      await loadAggregate({ command: {}});
    }).is.throwingAsync('Repository is missing.');
  });

  test('throws an error if the repository fails.', async () => {
    await assert.that(async () => {
      await loadAggregate({
        command: {},
        repository: {
          async loadAggregateFor () {
            throw new Error('Repository failed.');
          }
        }
      });
    }).is.throwingAsync('Repository failed.');
  });

  test('returns the aggregate if the command handler succeeds.', async () => {
    const aggregate = {},
          command = {};

    const receivedAggregate = await loadAggregate({
      command,
      repository: {
        async loadAggregateFor (receivedCommand) {
          assert.that(receivedCommand).is.sameAs(command);

          return aggregate;
        }
      }
    });

    assert.that(receivedAggregate).is.sameAs(aggregate);
  });
});

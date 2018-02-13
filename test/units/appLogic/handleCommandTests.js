'use strict';

const assert = require('assertthat');

const handleCommand = require('../../../appLogic/handleCommand');

suite('handleCommand', () => {
  test('is a function.', async () => {
    assert.that(handleCommand).is.ofType('function');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await handleCommand({});
    }).is.throwingAsync('Command is missing.');
  });

  test('throws an error if command handler is missing.', async () => {
    await assert.that(async () => {
      await handleCommand({ command: {}});
    }).is.throwingAsync('Command handler is missing.');
  });

  test('throws an error if aggregate is missing.', async () => {
    await assert.that(async () => {
      await handleCommand({ command: {}, commandHandler: {}});
    }).is.throwingAsync('Aggregate is missing.');
  });

  test('throws an error if the command handler fails.', async () => {
    await assert.that(async () => {
      await handleCommand({
        command: {},
        commandHandler: {
          async handle () {
            throw new Error('Command handler failed.');
          }
        },
        aggregate: {}
      });
    }).is.throwingAsync('Command handler failed.');
  });

  test('does not throw an error if the command handler succeeds.', async () => {
    await assert.that(async () => {
      await handleCommand({
        command: {},
        commandHandler: {
          async handle () {
            // Intentionally left blank.
          }
        },
        aggregate: {}
      });
    }).is.not.throwingAsync();
  });
});

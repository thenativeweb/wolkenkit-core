'use strict';

const assert = require('assertthat');

const validateCommand = require('../../../appLogic/validateCommand');

suite('validateCommand', () => {
  test('is a function.', async () => {
    assert.that(validateCommand).is.ofType('function');
  });

  test('throws an error if command is missing.', async () => {
    await assert.that(async () => {
      await validateCommand({});
    }).is.throwingAsync('Command is missing.');
  });

  test('throws an error if write model is missing.', async () => {
    await assert.that(async () => {
      await validateCommand({
        command: {}
      });
    }).is.throwingAsync('Write model is missing.');
  });

  test('throws an error if the context does not exist.', async () => {
    await assert.that(async () => {
      await validateCommand({
        command: {
          context: { name: 'non-existent' },
          aggregate: { name: 'peerGroup' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });
    }).is.throwingAsync('Invalid context name.');
  });

  test('throws an error if the aggregate does not exist.', async () => {
    await assert.that(async () => {
      await validateCommand({
        command: {
          context: { name: 'planning' },
          aggregate: { name: 'non-existent' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });
    }).is.throwingAsync('Invalid aggregate name.');
  });

  test('does not throw an error if everything is fine.', async () => {
    await assert.that(async () => {
      await validateCommand({
        command: {
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup' }
        },
        writeModel: {
          planning: { peerGroup: {}}
        }
      });
    }).is.not.throwingAsync();
  });
});

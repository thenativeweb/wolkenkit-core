'use strict';

const assert = require('assertthat');

const getClient = require('../../../../CommandHandler/services/getClient');

suite('getClient', () => {
  test('is a function.', async () => {
    assert.that(getClient).is.ofType('function');
  });

  test('throws an error if metadata are missing.', async () => {
    assert.that(() => {
      getClient({});
    }).is.throwing('Metadata are missing.');
  });

  test('throws an error if client is missing.', async () => {
    assert.that(() => {
      getClient({ metadata: {}});
    }).is.throwing('Client is missing.');
  });

  test('returns the client section from metadata.', async () => {
    const client = getClient({ metadata: { client: { foo: 'bar' }}});

    assert.that(client).is.equalTo({ foo: 'bar' });
  });
});

'use strict';

const path = require('path');

const assert = require('assertthat'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Repository = require('../../../../repository/Repository');

const getApp = require('../../../../CommandHandler/services/getApp');

const repository = new Repository();
const { writeModel } = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', 'app'));

suite('getApp', () => {
  test('is a function.', async () => {
    assert.that(getApp).is.ofType('function');
  });

  test('throws an error if repository is missing.', async () => {
    assert.that(() => {
      getApp({});
    }).is.throwing('Repository is missing.');
  });

  test('throws an error if write model is missing.', async () => {
    assert.that(() => {
      getApp({ repository });
    }).is.throwing('Write model is missing.');
  });

  test('has contexts.', async () => {
    const app = getApp({ repository, writeModel });

    assert.that(app.planning).is.ofType('object');
  });

  test('contains the aggregates defined by the write model.', async () => {
    const app = getApp({ repository, writeModel });

    assert.that(app.planning.peerGroup).is.ofType('function');
  });

  test('has a read function for an aggregate instance.', async () => {
    const app = getApp({ repository, writeModel });

    const peerGroup = app.planning.peerGroup(uuid());

    assert.that(peerGroup.read).is.ofType('function');
  });
});

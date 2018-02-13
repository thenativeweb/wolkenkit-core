'use strict';

const path = require('path');

const assert = require('assertthat'),
      uuid = require('uuidv4'),
      WolkenkitApplication = require('wolkenkit-application');

const Repository = require('../../../../../repository/Repository');

const App = require('../../../../../CommandHandler/Services/app/App');

const repository = new Repository();
const writeModel = new WolkenkitApplication(path.join(__dirname, '..', '..', '..', '..', '..', 'app')).writeModel;

suite('App', () => {
  test('is a function.', done => {
    assert.that(App).is.ofType('function');
    done();
  });

  test('throws an error if options are missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new App();
      /* eslint-enable no-new */
    }).is.throwing('Options are missing.');
    done();
  });

  test('throws an error if repository is missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new App({});
      /* eslint-enable no-new */
    }).is.throwing('Repository is missing.');
    done();
  });

  test('throws an error if write model is missing.', done => {
    assert.that(() => {
      /* eslint-disable no-new */
      new App({ repository });
      /* eslint-enable no-new */
    }).is.throwing('Write model is missing.');
    done();
  });

  test('has contexts.', done => {
    const instance = new App({ repository, writeModel });

    assert.that(instance.planning).is.ofType('object');
    done();
  });

  suite('contexts', () => {
    let instance;

    setup(() => {
      instance = new App({ repository, writeModel });
    });

    test('contains the aggregates defined by the write model.', done => {
      assert.that(instance.planning.peerGroup).is.ofType('function');
      done();
    });

    test('connects the aggregates to the repository.', done => {
      const peerGroup = instance.planning.peerGroup(uuid());

      assert.that(peerGroup.read).is.ofType('function');
      done();
    });
  });
});

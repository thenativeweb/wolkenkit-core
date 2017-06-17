'use strict';

const App = require('./App');

const app = function (options) {
  const instance = new App(options);

  return function () {
    return instance;
  };
};

module.exports = app;

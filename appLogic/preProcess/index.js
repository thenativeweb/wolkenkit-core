'use strict';

const initializeOwnership = require('./initializeOwnership'),
      isAccessGrantedToAggregate = require('./isAccessGrantedToAggregate'),
      isAccessGrantedToCommand = require('./isAccessGrantedToCommand');

// Order is important here, hence we can not use require-dir.
module.exports = [
  isAccessGrantedToCommand,
  initializeOwnership,
  isAccessGrantedToAggregate
];

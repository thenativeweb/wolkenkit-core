'use strict';

const initializeOwnership = require('./initializeOwnership'),
      isAccessGrantedToAggregate = require('./isAccessGrantedToAggregate'),
      isAccessGrantedToCommand = require('./isAccessGrantedToCommand');

module.exports = [ isAccessGrantedToCommand, initializeOwnership, isAccessGrantedToAggregate ];

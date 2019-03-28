'use strict';

const { forPublic } = require('wolkenkit-application-tools');

const initialState = {};

const commands = {
  executeWithIsAuthorizedTrue: {
    isAuthorized () {
      return true;
    },

    handle () {}
  },

  executeWithIsAuthorizedFalse: {
    isAuthorized () {
      return false;
    },

    handle () {}
  },

  executeWithIsAuthorizedThrowing: {
    isAuthorized () {
      throw new Error('Is authorized failed.');
    },

    handle () {}
  },

  executeWithRequestServicesInIsAuthorized: {
    isAuthorized (sampleAggregate, command, services) {
      if (typeof services !== 'object') {
        throw new Error('Services are missing.');
      }

      return true;
    },

    handle () {}
  },

  executeWithUseLoggerServiceInIsAuthorized: {
    isAuthorized (sampleAggregate, command, { logger }) {
      logger.info('Some message from isAuthorized.');

      return true;
    },

    handle () {}
  },

  execute: {
    isAuthorized: forPublic(),

    handle () {}
  },

  executeWithSchema: {
    schema: {
      type: 'object',
      properties: {
        requiredParameter: { type: 'string', minLength: 1 },
        optionalParameter: { type: 'string', minLength: 1 }
      },
      required: [ 'requiredParameter' ],
      additionalProperties: false
    },

    isAuthorized: forPublic(),

    handle () {
      // Intentionally left blank.
    }
  }
};

const events = {};

module.exports = { initialState, commands, events };

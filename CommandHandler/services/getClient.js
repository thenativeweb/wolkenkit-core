'use strict';

const getClient = function ({ metadata }) {
  if (!metadata) {
    throw new Error('Metadata are missing.');
  }
  if (!metadata.client) {
    throw new Error('Client is missing.');
  }

  return metadata.client;
};

module.exports = getClient;

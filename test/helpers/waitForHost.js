'use strict';

const url = require('url');

const knock = require('knockat');

const waitForHost = function (connectionString, callback) {
  const service = url.parse(connectionString);

  knock.at(service.hostname, service.port, errKnockAt => {
    if (errKnockAt) {
      return callback(errKnockAt);
    }
    callback(null);
  });
};

module.exports = waitForHost;

'use strict';

const requireDir = require('require-dir');

const serviceImplementations = requireDir(__dirname, { recurse: true });

const Services = function (options) {
  if (!options) {
    throw new Error('Options are missing.');
  }

  this.options = options;

  this.services = {};

  for (const name of Object.keys(serviceImplementations)) {
    this.services[name] = serviceImplementations[name].index(options);
  }
};

Services.prototype.get = function (serviceName) {
  if (!serviceName) {
    throw new Error('Service name is missing.');
  }
  if (!this.services[serviceName]) {
    throw new Error(`Unknown service '${serviceName}'.`);
  }

  return this.services[serviceName]();
};

module.exports = Services;

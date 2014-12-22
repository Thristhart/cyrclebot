var config = require('nconf');

config.argv().env().file({file:'config.json'});
config.defaults({
  username: "CyrcleBot"
});

module.exports = config;

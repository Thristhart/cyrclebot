module.exports = function(connection) {
  var Transformer = require('stream').Transform();
  Transformer._transform = function(chunk, enc, next) {
    var data = new Buffer(chunk.length);
    for(var i = 0; i < chunk.length; i += connection.packetBuffer.length)
    {
      this.push(chunk.slice(i, i + connection.packetBuffer.length));
    }
    next();
  };
  return Transformer;
};

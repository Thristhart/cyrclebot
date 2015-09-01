module.exports = function(mumbleClient) {
  var connection = mumbleClient.connection;
  var Transformer = require('stream').Transform();
  Transformer.progress = 0;
  Transformer._transform = function(chunk, enc, next) {
    var offset = 0;
    if(Transformer.skipTo && Transformer.skipProgress < Transformer.skipTo) {
      if(Transformer.skipProgress + chunk.length < Transformer.skipTo) {
        Transformer.skipProgress += chunk.length;
        Transformer.progress += chunk.length;
        next();
        return;
      }
      offset = Transformer.skipTo - Transformer.skipProgress;
      Transformer.skipProgress += offset;
      Transformer.progress += offset;
    }
    else {
      Transformer.progress += chunk.length;
    }
    var data = new Buffer(chunk.length);
    var part;
    for(var i = offset; i < chunk.length; i += connection.packetBuffer.length)
    {
      part = chunk.slice(i, i + connection.packetBuffer.length);
      this.push(transform(part, applyVolume));
    }
    next();
  };
  function transform(buffer, func) {
    var newBuff = new Buffer(buffer.length);
    for(var i = 0; i < buffer.length; i+=2) {
      var integer = buffer.readInt16LE(i);
      newBuff.writeInt16LE(func(integer), i);
    }
    return newBuff;
  }
  function applyVolume(integer) {
    var volumeFactor = (mumbleClient.volume)/100;
    return Math.round(integer * volumeFactor);
  }
  return Transformer;
};


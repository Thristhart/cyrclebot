var util = require('util');
var stream = require('stream');
var Transform = stream.Transform;

var Transformer = function(options) {
  this.progress = options.progress || 0;
  this.mumbleClient = options.mumbleClient;
  Transform.call(this, options);
}
util.inherits(Transformer, Transform);
Transformer.prototype._transform = function(chunk, enc, next) {
  var connection = this.mumbleClient.connection;
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
    this.push(transform(part, this.applyVolume.bind(this)));
  }
  next();
};
Transformer.prototype.applyVolume = function(integer) {
  var volumeFactor = (this.mumbleClient.volume)/100;
  return this.capWave(Math.round(integer * volumeFactor));
}
Transformer.prototype.capWave = function(integer) {
  if(integer < -32768) {
    return -32768;
  }
  if(integer > 32767) {
    return 32767;
  }
  return integer;
}
function transform(buffer, func) {
  var newBuff = new Buffer(buffer.length);
  for(var i = 0; i < buffer.length; i+=2) {
    var integer = buffer.readInt16LE(i);
    newBuff.writeInt16LE(func(integer), i);
  }
  return newBuff;
}

module.exports = Transformer;

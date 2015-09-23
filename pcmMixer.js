var util = require('util');
var stream = require('stream');
var Readable = stream.Readable;

var Mixer = function(options) {
  this.streams = [];
  this.connection = options.mumbleClient.connection;
  Readable.call(this, options);
}
util.inherits(Mixer, Readable);

Mixer.prototype._read = function(size) {
  if(this.streams.length > 0) {
    this.doRead(size);
  }
};
Mixer.prototype.doRead = function(size) {
  var self = this;
  var anyData = false;;
  var buffers = self.streams.map(function(stream) {
    var data = stream.read(size);
    if(!data) {
      if(!stream.hasReadableEvent) {
        stream.once('readable', function() {
          self.doRead();
          stream.hasReadableEvent = false;
        });
        stream.hasReadableEvent = true;
      }
      return new Buffer([0]);
    }
    anyData = true;
    return data;
  })

  if(!anyData) {
    return;
  }


  var emptyBuffer = new Buffer(2);
  emptyBuffer.fill(0);

  var combinedBuffer = buffers.reduce(function(buffA, buffB) {
    var maxLength = Math.max(buffA.length, buffB.length);
    var combinedBuff = new Buffer(maxLength);
    for(var i = 0; i < maxLength; i+=2) {
      var int = 0;
      if(i + 1 < buffA.length) {
        int += buffA.readUInt16LE(i);
      }
      if(i + 1 < buffB.length) {
        int = buffB.readUInt16LE(i);
      }
      combinedBuff.writeUInt16LE(int, i);
    }
    return combinedBuff;
    /*
    var parts = [];
    for(var i = 0; i < buff.length; i += self.connection.packetBuffer.length)
    {
      part = buff.slice(i, i + self.connection.packetBuffer.length);
      parts.push(part);
    }
    return parts;*/
  }, emptyBuffer);


  self.push(combinedBuffer);
};
Mixer.prototype.capWave = function(integer) {
  if(integer < -32768) {
    return -32768;
  }
  if(integer > 32767) {
    return 32767;
  }
  return integer;
}

Mixer.prototype.addStream = function(stream) {
  console.log("Add stream");
  this.streams.push(stream);
  this.doRead();
};

Mixer.prototype.removeStream = function(stream) {
  this.streams.splice(this.streams.indexOf(stream));
};

module.exports = Mixer;

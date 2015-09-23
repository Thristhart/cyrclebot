var config = require('./config');

var mumble = require('mumble');
var fs = require('fs');

var options = {};

if( config.get("key") )
  options.key = fs.readFileSync( config.get("key") );
if( config.get("cert") )
  options.cert = fs.readFileSync( config.get("cert") );

if( !config.get("serverAddress") )
  throw new Error("Must have config option serverAddress");


mumble.connect( config.get("serverAddress"), options, function(error, mumbleClient) {
  if(error) {
    throw new Error(error);
  }

  // stream that goes to the server
  var inputStream;
  // stream from the server
  var outputStream;

  var MessageHandler;
  mumbleClient.updateChannelName = function(new_name) {
    this.connection.sendMessage('ChannelState', {channel_id: this.user.channel.id, name: new_name.replace(/([^\w\W])+/g, "")});
  };
 
  mumbleClient.baseChannelName = config.get("channelName");
  mumbleClient.volume = 50;
  
  mumbleClient.authenticate('CyrcleBot');
  mumbleClient.on('initialized', function() {
    console.log("Init success");
    inputStream = mumbleClient.inputStream();
    outputStream = mumbleClient.outputStream();
    MessageHandler = require('./messageHandler')(mumbleClient, inputStream);
  });
  mumbleClient.on('protocol-in', function(data) {
    if(data.type != "Ping" && data.type != "PermissionDenied") {

    }
    if(data.type == "TextMessage") {
      MessageHandler(data);
    }
    if(data.type == "ChannelState") {
    }
    if(data.type == "ServerConfig") {
      joinChannel(mumbleClient, findChannelByPrefix(mumbleClient,config.get("channelName")));
    }
  });
  mumbleClient.on('error', function(data) {
  });
});
function findChannelByPrefix(mumbleClient, prefix) {
  for(var i in mumbleClient._channels) {
    var chan = mumbleClient._channels[i];
    if(chan.name && chan.name.indexOf(prefix) === 0) {
      return chan;
    }
  }
  return null;
}
function joinChannel(mumbleClient, channel) {
  channel.join();
  mumbleClient.currentChannelId = channel.id;
}


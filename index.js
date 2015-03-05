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


mumble.connect( config.get("serverAddress"), options, function(error, connection) {
  if(error) {
    throw new Error(error);
  }

  // stream that goes to the server
  var inputStream;
  // stream from the server
  var outputStream;

  var MessageHandler;
  connection.updateChannelName = function(new_name) {
    this.sendMessage('ChannelState', {channelId: this.currentChannelId, name: new_name.replace(/([^\w\W])+/g, "")});
  };
 
  connection.baseChannelName = config.get("channelName");
  connection.volume = 50;
  
  connection.authenticate('CyrcleBot');
  connection.on('initialized', function() {
    console.log("Init success");
    inputStream = connection.inputStream();
    outputStream = connection.outputStream();
    MessageHandler = require('./messageHandler')(connection, inputStream);
  });
  connection.on('protocol-in', function(data) {
    if(data.type != "Ping" && data.type != "PermissionDenied")
      console.log('event: ', data.type, 'data', data.message);
    if(data.type == "TextMessage") {
      MessageHandler(data);
    }
    if(data.type == "ChannelState") {
    }
    if(data.type == "ServerConfig") {
      joinChannel(connection, findChannelByPrefix(connection,config.get("channelName")));
    }
  });
});
function findChannelByPrefix(connection, prefix) {
  for(var i in connection.channels) {
    var chan = connection.channels[i];
    if(chan.name && chan.name.indexOf(prefix) === 0)
      return chan;
  }
  return null;
}
function joinChannel(connection, channel) {
  connection.sendMessage( 'UserState', 
    {session: connection.sessionId,
    actor: connection.sessionId,
    channelId: channel.channelId});
  connection.currentChannelId = channel.channelId;
}


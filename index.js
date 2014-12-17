var config = require('nconf');

config.argv().env().file({file:'config.json'});
config.defaults({
  username: "CyrcleBot"
});

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

  var Transformer;
  var MessageHandler;
  
  
  connection.authenticate('CyrcleBot');
  connection.on('initialized', function() {
    console.log("Init success");
    inputStream = connection.inputStream();
    outputStream = connection.outputStream();
    Transformer = require('./transformer')(connection);
    MessageHandler = require('./messageHandler')(connection, Transformer, inputStream);
  });
  connection.on('protocol-in', function(data) {
    if(data.type != "Ping")
      console.log('event: ', data.type, 'data', data.message);
    if(data.type == "TextMessage") {
      MessageHandler(data);
    }
  });
});

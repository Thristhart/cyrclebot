var Player = require('./player');
var config = require('./config');
var request = require('request');
var html_strip = require('htmlstrip-native').html_strip;

module.exports = function(connection, inputStream) {
  var redis = require('redis');
  var client = redis.createClient(config.get("redisOpts"));
  client.subscribe("cyrclebot:commands", function() {
    client.on("message", function(channel, command) {
      MessageHandler({message: {message: command}});
    });
  });
  var player = new Player(connection, inputStream);
  var MessageHandler = function(data) {
    var msg = html_strip(data.message.message);
    var youtubeID = ytVidId(msg);
    if(youtubeID) {
      player.addToQueue(youtubeID);
    }
    else {
      var youtubePlaylistID = ytPlaylistId(msg);
      if(youtubePlaylistID) {
        player.addPlaylistToQueue(youtubePlaylistID);
      }
      else { // not a youtube url, maybe it's a raw content file?
        request.head(msg, function(error, response, body) {
          if(error) {
            console.log("Got error from attempt to identify via HEAD: %o", error);
            console.log("Couldn't identify a contentType for url, no faucet assigned");
            return;
          }
          console.log("Got HEAD response: %o", response.headers);
          var type = response.headers["content-type"];
          switch(type) {
            case "video/mp4":
            case "video/webm":
            case "video/ogg":
            case "application/ogg":
            case "audio/mpeg":
            case "audio/webm":
            case "audio/ogg":
            case "audio/wave":
            case "audio/wav":
            case "audio/x-wav":
            case "audio/x-pn-wav":
            case "\"application/octet-stream\";": // newgrounds identifies mp3s with this
              console.log("Identified content type of %s", type);
              player.addArbitraryMedia(msg);
              break;
            default:
              console.log("Got a contentType we don't know, returning null (%s)", type);
          }
        });
      };
    }
    if(msg == "stop") {
      player.stop();
    }
    if(msg == "play" && !player.currentStream) {
      player.next();
    }
    if(msg == "skip") {
      player.next();
    }
    if(msg == "clear") {
      player.clearQueue();
    }
    if(msg == "shuffle") {
      console.log("Shuffle");
      player.shuffle();
    }
    if(msg.indexOf("say") === 0) {
      var line = msg.split("say")[1];
      //player.say(line);
    }
    if(msg.indexOf("vol") === 0) {
      var newNum = msg.split(/volume|vol/)[1];
      if(newNum) {
        var vol = parseInt(newNum);
        if(!isNaN(vol) && vol > 0 && vol < 101) {
          player.setVolume(vol);
        }
      }
    }
  };
  return MessageHandler;
};

/**
 * JavaScript function to match (and return) the video Id 
 * of any valid Youtube Url, given as input string.
 * @author: Stephan Schmitz <eyecatchup@gmail.com>
 * @url: http://stackoverflow.com/a/10315969/624466
 */
function ytVidId(url) {
  var p = /(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?/;
  return (url.match(p)) ? RegExp.$1 : false;
}
function ytPlaylistId(url) {
  var p = /^.*(youtu.be\/|list=)([^#\&\?<]*)/;
  return (url.match(p)) ? RegExp.$2 : false;
}

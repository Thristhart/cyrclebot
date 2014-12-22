var Player = require('./player');
module.exports = function(connection, inputStream) {
  var player = new Player(connection, inputStream);
  var MessageHandler = function(data) {
    var msg = data.message.message;
    var youtubeID = ytVidId(msg);
    if(youtubeID) {
      player.addToQueue(youtubeID);
    }
    else {
      var youtubePlaylistID = ytPlaylistId(msg);
      if(youtubePlaylistID) {
        player.addPlaylistToQueue(youtubePlaylistID);
      }
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
    if(msg == "shuffle") {
      player.shuffle();
    }
    if(msg.indexOf("vol") === 0) {
      var newNum = msg.split(/volume|vol/)[1];
      console.log(msg.split(/volume|vol/));
      if(newNum) {
        var vol = parseInt(newNum);
        console.log(vol);
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

var Player = require('./player');
module.exports = function(connection, inputStream) {
  var player = new Player(connection, inputStream);
  var MessageHandler = function(data) {
    var msg = data.message.message;
    var youtubeID = ytVidId(msg);
    if(youtubeID) {
      player.addToQueue("https://youtube.com/watch?v=" + youtubeID);
    }
    if(msg == "stop") {
      player.stop();
    }
    if(msg == "skip") {
      player.next();
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

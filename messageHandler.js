var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
module.exports = function(connection, Transformer, inputStream) {
  var MessageHandler = function(data) {
    var msg = data.message.message;
    var youtubeID = ytVidId(msg);
    if(youtubeID) {
      ytdl.getInfo("https://youtube.com/watch?v=" + youtubeID, 
      {downloadURL: true},
      function(err, info) {
        if(err) {
          throw new Error(error);
        }
        console.log(info);
        var youtubeStream = ytdl.downloadFromInfo(info, {
          filter: function(format) {
            // do all youtube videos have audio format?
            return format.type.indexOf("audio") != -1;
          }
        });
        ffmpeg()
          .input(youtubeStream)
          .format("s16le") // signed little endian 16-bit
          .outputOptions("-ar 24000") // 24000 sample rate
          .audioCodec('pcm_s16le')
          .pipe(Transformer)
          .pipe(inputStream);
      });
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

var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
module.exports = function(connection, inputStream) {
  this.playQueue = [];
  this.currentStream = null;
  this.ffmpegInstance = null;
  this.Transformer = null;
  this.addToQueue = function(url) {
    if(this.playQueue.length === 0 && !this.currentStream) // nothing in queue or playing
      this.play(url);
    else
      this.playQueue.push(url);
  };
  this.play = function(url) {
    console.log("Playing url: " + url);
    ytdl.getInfo(url, {downloadURL: true}, function(err, info) {
      if(err) {
        console.log("Youtube error: " + err);
        return;
      }
      console.log("Downloaded youtube info for " + info.title + ", now creating stream...");
      var youtubeStream = ytdl.downloadFromInfo(info, {
        filter: function(format) {
          // do all youtube videos have audio format?
          return format.type.indexOf("audio") != -1;
        }
      });
      this.stop();
      this.currentStream = youtubeStream;
      this.ffmpegInstance = ffmpeg()
        .input(youtubeStream)
        .format("s16le") // signed little endian 16-bit
        .outputOptions("-ar 24000") // 24000 sample rate
        .audioCodec('pcm_s16le')
        .on('error', function(err, stdout, stderr) {
          if(err.message.indexOf("SIGKILL") == -1)
            console.log("ffmpeg error: " + err.message);
        })
        .on('end', function() {
          this.ffmpegInstance = null;
        }.bind(this));
      this.Transformer = require('./transformer')(connection);
      // end: false ensures that inputStream stays open
      this.ffmpegInstance
        .pipe(this.Transformer)
        .pipe(inputStream, {end: false});
      // Once the song ends, if it just ran out, move to next song
      // otherwise, we've been stopped manually and should do nothing
      this.Transformer.once('end', function() {
        console.log("Transformer ended");
        if(!this.Transformer.stopped)
          this.next();
      }.bind(this));
    }.bind(this));
  };
  this.stop = function() {
    if(this.currentStream) {
      this.currentStream.unpipe();
      this.currentStream = null;
    }
    if(this.ffmpegInstance) {
      this.ffmpegInstance.kill();
      this.ffmpegInstance = null;
    }
    if(this.Transformer) {
      this.Transformer.unpipe();
      this.Transformer.stopped = true;
      this.Transformer = null;
    }
  };
  this.next = function() {
    if(this.currentStream)
      this.stop();
    if(this.playQueue.length > 0)
      this.play(this.playQueue.shift());
  };
};

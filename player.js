var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
module.exports = function(connection, inputStream) {
  this.playQueue = [];
  this.currentStream = null;
  this.ffmpegInstance = null;
  this.Transformer = null;
  this.lastPlayStart = Date.now();
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
      youtubeStream.on('format', function(ev) {
        console.log("Format found: ", ev);
      });
      youtubeStream.info = info;
      this.stop();
      this.currentStream = youtubeStream;
      this.updateNowPlaying();
      this.ffmpegInstance = ffmpeg()
        .input(youtubeStream)
        .format("s16le") // signed little endian 16-bit
        .outputOptions("-ar 24000") // 24000 sample rate
        .audioCodec('pcm_s16le')
        .on('error', function(err, stdout, stderr) {
          if(err.message.indexOf("SIGKILL") == -1)
            console.log("ffmpeg error: " + err.message);
        })
        .on('start', function() {
          console.log("ffmpeg start");
          this.lastPlayStart = Date.now();
        }.bind(this))
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
    connection.updateChannelName(connection.baseChannelName);
  };
  this.next = function() {
    if(this.currentStream)
      this.stop();
    if(this.playQueue.length > 0)
      this.play(this.playQueue.shift());
  };
  this.updateNowPlaying = function() {
    var info = this.currentStream.info;
    connection.updateChannelName(connection.baseChannelName + " - " + info.title + " " + this.generateProgressBar(10));
  };
  this.generateProgressBar = function(size) {
    var progress = (Date.now() - this.lastPlayStart) / (this.currentStream.info.length_seconds * 1000);
    var beforeCount = Math.round(size * progress);
    var afterCount = size - beforeCount;
    afterCount--;
    var display = "";
    for(var i = 0; i < beforeCount; i++)
      display += "-";
    display += "O";
    for(i = 0; i < afterCount; i++)
      display += "-";
    return display;
  };
  setInterval(function() {
    if(this.currentStream)
      this.updateNowPlaying();
  }.bind(this), 1000);
};

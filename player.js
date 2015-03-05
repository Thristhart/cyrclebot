var config = require('./config');
var ytdl = require('ytdl-core');
var Youtube = require('youtube-api');

var redis = require('redis');
var client = redis.createClient(config.get("redisOpts"));

var textToWave = require("text2wave");

Youtube.authenticate({
  type: "key",
  key: config.get("youtubeKey")
});
var ffmpeg = require('fluent-ffmpeg');
module.exports = function(connection, inputStream) {
  this.playQueue = [];
  this.currentStream = null;
  this.ffmpegInstance = null;
  this.Transformer = null;
  this.lastPlayStart = Date.now();
  this.addToQueue = function(id) {
    var url = "https://youtube.com/watch?v=" + id;
    if(this.playQueue.length === 0 && !(this.playing || this.currentStream)) {
      // nothing in queue or playing
      this.play(url);
    }
    else {
      this.playQueue.push(url);
      client.rpush("cyrclebot:playQueue", url);
    }
  };
  this.addPlaylistToQueue = function(plId) {
    Youtube.playlistItems.list({"part": "contentDetails", "maxResults": 50, "playlistId": plId},
    function(err, data) {
      if(err)
        return console.log("YT playlist error: ", err);
      for(var vid in data.items) {
        this.addToQueue(data.items[vid].contentDetails.videoId);
      }
    }.bind(this));
  };
  this.say = function(text) {
    var tts = textToWave(text);
    this.Transformer = require('./transformer')(connection);
    this.Transformer.skipTo = 0;
    this.ffmpegInstance = ffmpeg()
      .input(tts)
      .format("s16le") // signed little endian 16-bit
      .outputOptions(["-ar " + connection.SAMPLING_RATE, "-ac 1"]) // 24000 sample rate, 1 channel
      .audioCodec('pcm_s16le')
      .on('error', function(err, stdout, stderr) {
        if(err.message.indexOf("SIGKILL") == -1)
          console.log("ffmpeg error: " + err.message);
      })
      .on('end', function() {
        this.ffmpegInstance = null;
      }.bind(this))
      .pipe(this.Transformer)
      .pipe(inputStream, {end: false});
  };
  this.clearQueue = function() {
    this.playQueue = [];
    client.del("cyrclebot:playQueue");
  };
  this.play = function(url, startBytes, progress) {
    console.log("Playing url: " + url);
    this.playing = true;
    client.set("cyrclebot:nowPlaying", url);
    client.sadd("cyrclebot:playHistory", url);
    var opts = {};
    opts.downloadURL = true;
    ytdl.getInfo(url, opts, function(err, info) {
      if(err) {
        console.log("Youtube error: " + err);
        return;
      }
      console.log("Downloaded youtube info for " + info.title + ", now creating stream...");
      var youtubeStream = ytdl.downloadFromInfo(info, {
        filter: "audio"
      });
      youtubeStream.on('format', function(ev) {
        console.log("Format found: ", ev);
        youtubeStream.byteSize = ev.size;
        client.set("cyrclebot:byteSize", ev.size);
        client.set("cyrclebot:songLength", youtubeStream.info.length_seconds);
      });
      youtubeStream.info = info;
      this.stop();
      this.currentStream = youtubeStream;
      this.updateNowPlaying();
      this.ffmpegInstance = ffmpeg()
        .input(youtubeStream)
        .format("s16le") // signed little endian 16-bit
        .outputOptions(["-ar " + connection.SAMPLING_RATE, "-ac 1"]) // 24000 sample rate, 1 channel
        .audioCodec('pcm_s16le')
        .on('error', function(err, stdout, stderr) {
          if(err.message.indexOf("SIGKILL") == -1)
            console.log("ffmpeg error: " + err.message);
        })
        .on('start', function() {
          console.log("ffmpeg start");
          this.lastPlayStart = Date.now();
          if(startBytes) {
            this.lastPlayStart -= progress * youtubeStream.info.length_seconds * 1000;
          }
        }.bind(this))
        .on('end', function() {
          this.ffmpegInstance = null;
        }.bind(this));
      this.Transformer = require('./transformer')(connection);
      this.Transformer.skipTo = startBytes;
      this.Transformer.skipProgress = 0;
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
  this.shuffle = function() {
    this.playQueue = shuffle(this.playQueue);
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
    client.del("cyrclebot:progress");
    this.playing = false;
    connection.updateChannelName(connection.baseChannelName + " volume:" + connection.volume + "/100 | " + this.playQueue.length + " in queue");
  };
  this.next = function() {
    if(this.currentStream || this.playing)
      this.stop();
    if(this.playQueue.length > 0) {
      this.play(this.playQueue.shift());
      client.lpop("cyrclebot:playQueue");
    }
  };
  this.resume = function() {
    client.mget(
          ["cyrclebot:progress",
          "cyrclebot:nowPlaying",
          "cyrclebot:byteProgress"],
    function(err, values) {
      var progress = parseFloat(values[0]);
      var url = values[1];
      var byteStart = parseInt(values[2]);
      this.play(url, byteStart, progress);
    }.bind(this));
  };
  this.setVolume = function(volume) {
    connection.volume = volume;
    client.set("cyrclebot:volume", volume);
  };
  this.updateNowPlaying = function() {
    var info = this.currentStream.info;
    client.set("cyrclebot:nowPlayingTitle", info.title);
    connection.updateChannelName(connection.baseChannelName + " " + info.title + " vol:" + connection.volume + "/100 | " + this.playQueue.length + " in queue " + this.generateProgressBar(10));
  };
  this.generateProgressBar = function(size) {
    var progress = (Date.now() - this.lastPlayStart) / (this.currentStream.info.length_seconds * 1000);
    client.set("cyrclebot:progress", progress);
    client.set("cyrclebot:nowPlayingLength", this.currentStream.info.length_seconds);
    if(this.Transformer) {
      client.set("cyrclebot:byteProgress", this.Transformer.progress);
    }
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
  client.get("cyrclebot:progress", function(err, progress) {
    progress = parseFloat(progress);
    if(!isNaN(progress) && progress < 0.95)
      this.resume();
  }.bind(this));
  client.lrange("cyrclebot:playQueue", 0, -1, function(err, queue) {
    this.playQueue = queue;
  }.bind(this));
  client.get("cyrclebot:volume", function(err, vol) {
    connection.volume = parseInt(vol);
    if(isNaN(connection.volume))
      connection.volume = 50;
  }.bind(this));
  setInterval(function() {
    if(this.currentStream)
      this.updateNowPlaying();
  }.bind(this), 1000);
};
// bog standard in-place fisher-yates shuffle
function shuffle(arr) {
  var target = arr.length - 1;
  while(target > 0) {
    var randIndex = Math.floor(Math.random() * target--);
    var copy = arr[target];
    arr[target] = arr[randIndex];
    arr[randIndex] = copy;
  }
  return arr;
}

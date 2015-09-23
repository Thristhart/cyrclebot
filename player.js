var config = require('./config');
var ytdl = require('ytdl-core');
var Youtube = require('youtube-api');
var urlLib = require('url');
var path = require('path');

var redis = require('redis');
var client = redis.createClient(config.get("redisOpts"));

var textToWave = require("text2wave");
var request = require("request");

var Transformer = require('./transformer');

var Mixer = require('./pcmMixer');

Youtube.authenticate({
  type: "key",
  key: config.get("youtubeKey")
});
var ffmpeg = require('fluent-ffmpeg');
module.exports = function(mumbleClient, inputStream) {
  this.playQueue = [];
  this.streams = [];
  this.ffmpegInstance = null;
  this.lastPlayStart = Date.now();
  this.addToQueue = function(id) {
    var url = "https://youtube.com/watch?v=" + id;
    this.addArbitraryMedia(url);
  };
  this.addArbitraryMedia = function(url, simul) {
    if((this.playQueue.length === 0 && !(this.playing || this.streams.length > 0)) || simul) {
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
  this.playStream = function(stream, startBytes, progress) {
    this.stop();
    this.streams.push(stream);
    this.updateNowPlaying();
    stream.ffmpegInstance = ffmpeg()
      .input(stream)
      .format("s16le") // signed little endian 16-bit
      .outputOptions(["-ar " + mumbleClient.connection.SAMPLING_RATE, "-ac 1"]) // 24000 sample rate, 1 channel
      .audioCodec('pcm_s16le')
      .on('error', function(err, stdout, stderr) {
        if(err.message.indexOf("SIGKILL") == -1)
          console.log("ffmpeg error: " + err.message);
      })
      .on('start', function() {
        console.log("ffmpeg start");
        this.lastPlayStart = Date.now();
        if(startBytes) {
          this.lastPlayStart -= progress * stream.info.length_seconds * 1000;
        }
      }.bind(this))
      .on('end', function() {
        stream.ffmpegInstance = null;
      }.bind(this));
    stream.Transformer = new Transformer({mumbleClient: mumbleClient});
    stream.Transformer.skipTo = startBytes;
    stream.Transformer.skipProgress = 0;
    // end: false ensures that inputStream stays open
    stream.ffmpegInstance
      .pipe(stream.Transformer)
      .pipe(inputStream, {end: false});
    //this.mixer.addStream(stream.Transformer);
    // Once the song ends, if it just ran out, move to next song
    // otherwise, we've been stopped manually and should do nothing
    stream.Transformer.once('end', function() {
      console.log("Transformer ended, was stopped: ", stream.Transformer.stopped);
      this.next();
    }.bind(this));
  };
  this.say = function(text) {
    /*
    var tts = textToWave(text);
    this.Transformer = require('./transformer')(mumbleClient);
    this.Transformer.skipTo = 0;
    this.ffmpegInstance = ffmpeg()
      .input(tts)
      .format("s16le") // signed little endian 16-bit
      .outputOptions(["-ar " + mumbleClient.connection.SAMPLING_RATE, "-ac 1"]) // 24000 sample rate, 1 channel
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
      */
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
    if(url.indexOf("https://youtube.com") != -1) {
      this.playYoutube(url, startBytes, progress);
    }
    else {
      var requestStream = request(url);
      requestStream.info = {};
      requestStream.info.title = path.basename(urlLib.parse(url).path);
      requestStream.info.length_seconds = 1000;
      requestStream.on("response", function(response) {
        var disposition = response.headers["content-disposition"];
        var filenameRegex = /filename="(.*?)"/;
        var match = filenameRegex.exec(disposition);
        if(match && match[1]) {
          requestStream.info.title = match[1];
        }
      }.bind(this));
      this.playStream(requestStream, startBytes, progress);
    }
  };
  this.playYoutube = function(url, startBytes, progress) {
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
      this.playStream(youtubeStream, startBytes, progress);
    }.bind(this));
  };
  this.shuffle = function() {
    this.playQueue = shuffle(this.playQueue);
  };
  this.stopStream = function(stream) {
    if(stream.unpipe)
      stream.unpipe();
    if(stream.end)
      stream.end();
    if(stream.Transformer) {
      stream.Transformer.unpipe();
      stream.Transformer.stopped = true;
      stream.Transformer = null;
    }
    if(stream.ffmpegInstance) {
      stream.ffmpegInstance.kill();
      stream.ffmpegInstance = null;
    }
  };
  this.stop = function() {
    console.log("Stop playing ", this.streams.length, " streams");
    if(this.streams.length > 0) {
      this.streams = this.streams.filter(this.stopStream);
    }
    client.del("cyrclebot:progress");
    this.playing = false;
    mumbleClient.updateChannelName(mumbleClient.baseChannelName + " volume:" + mumbleClient.volume + "/100 | " + this.playQueue.length + " in queue");
  };
  this.next = function() {
    console.log("Play next song");
    if(this.streams.length > 0 || this.playing) {
      this.stop();
    }
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
    mumbleClient.volume = volume;
    client.set("cyrclebot:volume", volume);
  };
  this.updateNowPlaying = function() {
    var info = this.streams[0].info;
    client.set("cyrclebot:nowPlayingTitle", info.title);
    mumbleClient.updateChannelName(mumbleClient.baseChannelName + " " + info.title + " vol:" + mumbleClient.volume + "/100 | " + this.playQueue.length + " in queue " + this.generateProgressBar(10));
  };
  this.generateProgressBar = function(size) {
    var progress = (Date.now() - this.lastPlayStart) / (this.streams[0].info.length_seconds * 1000);
    client.set("cyrclebot:progress", progress);
    client.set("cyrclebot:nowPlayingLength", this.streams[0].info.length_seconds);
    if(this.streams[0].Transformer) {
      client.set("cyrclebot:byteProgress", this.streams[0].Transformer.progress);
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
    mumbleClient.volume = parseInt(vol);
    if(isNaN(mumbleClient.volume))
      mumbleClient.volume = 50;
  }.bind(this));
  setInterval(function() {
    if(this.streams.length > 0)
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

cyrclebot
=========

A bot for mumble that plays audio on request

## Configuration

All configuration is done in the config.json file.

```
{
  "key": "mumble.key",
  "cert": "mumble.cert",
  "serverAddress": "mumble://example.com:64738",
  "youtubeKey": "SERVER_API_KEY_GOES_HERE",
  "channelName": "Root",
  "redisOpts": {
    "host": "localhost"
  },
  "debug": false
}

```

### Keys

Mumble uses certificates to authenticate clients. Make a self signed one (it
doesn't matter to the server so long as the client is consistent):

    openssl req -x509 -nodes -sha256 -days 365 -newkey rsa:2048 -keyout mumble.key -out mumble.cert

The bot will need permission to edit the channel's name. In order to do that,
you'll need to register the user. The easiest way for now is to import the
certificate and key into Mumble. As it expects a PKCS#12 format file, generate
one from the bot's keys: (password is optional)

    openssl pkcs12 -export -in export.pem -out file.p12 -name "My Certificate"

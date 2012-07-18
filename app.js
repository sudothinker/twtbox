// Description:
//   None
//
// Configuration:
//   REDISTOGO_URL
//   HEROKU_URL
//   RDIO_API_KEY
//   RDIO_API_SECRET
//   

var express = require('express');
var sys = require('sys');
var io = require('socket.io');
var mixpanel = require('mixpanel');
var _ = require('underscore');
var RedisStore = require('connect-redis')(express);

var app = module.exports = express.createServer(express.logger());

var domain, mp_client, redisHost, redisPort, redisPass, rclient;

var Redis = require('redis');
var Url = require('url');

  info = Url.parse(process.env.REDISTOGO_URL || 'redis://localhost:6379');
  rclient = Redis.createClient(info.port, info.hostname);
  if(info.auth) {
    rclient.auth(info.auth.split(":")[1]);
  }
  domain = process.env.HEROKU_URL || "http://localhost:3000";

app.configure('development', function(){  
  mp_client = new mixpanel.Client("8c587841d6590b8d46ca00197d8339a0");
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  mp_client = new mixpanel.Client("f5b01baad731fa1f37a2fd7be9a1de44");
  app.use(express.errorHandler()); 
});

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.compiler({ src: __dirname + '/public', enable: ['less'] }));
  app.use(express.cookieParser());
  app.use(express.session({ store: new RedisStore({client: rclient}), secret: 'test' })); // TODO: Add secret, removed for security
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});
app.dynamicHelpers({
  scripts: function(req, res){return [];},
  styles: function(req, res){return [];}
});

var socket = io.listen(app);
var OAuth = require('./oauth').OAuth;
var oa = new OAuth("http://api.rdio.com/oauth/request_token", "http://api.rdio.com/oauth/access_token",
                  process.env.RDIO_API_KEY, process.env.RDIO_API_SECRET, // TODO: Add the rdio oauth tokens. Removed for security
                  "1.0", domain + "/callback", "HMAC-SHA1");                  
var rdioEndpoint = "http://api.rdio.com/1/";

// Routes
var getRequestToken = function(req, res, next) {
  oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
    if (error) {
      next(new Error("Error getting token: " + error));
    } else {
      req.session.token = oauth_token;
      req.session.token_secret = oauth_token_secret;
      req.loginUrl = results["login_url"];
      next();
    }
  });
};

var isMobile = function(req) {
  var ua = req.header('user-agent');
  if (/mobile/i.test(ua)) return true;
  else return false;
};

var loadAdmin = function(req, res, next) {
  if (req.session.oauth_access_token != undefined) {
    oa.post(rdioEndpoint, req.session.oauth_access_token, req.session.oauth_access_token_secret, 
      { "method" : "currentUser" }, function (error, data) {
      req.admin = JSON.parse(data)["result"];
      next();
    });
  } else {
    next();
  }
};

var adminRequired = function(req, res, next) {
  if (req.session.oauth_access_token == undefined) {
    res.redirect('/authorize');
  } else {
    next();
  }
};

// returns a 3 char room key
var createRoom = function() {
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz";

  for( var i=0; i < 3; i++ )
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  
  return text;
};

var getSongs = function(room) {
  return room + "_songs";
};

var getPlaying = function(room) {
  return room + "_playing";
}

app.get('/', loadAdmin, function(req, res, next){
  if (!isMobile(req)) {
    res.render('index', {
      admin: req.admin
    });
  } else {
    res.render('mobile-index');
  }
});

app.get('/about', function(req, res, next) {
  res.render('about');
});

// create a room and redirect to it
app.get('/create', adminRequired, function(req, res, next) {
  mp_client.track("room");
  var room = createRoom();
  res.redirect('/r/' + room);
});

app.get("/topsongs.json", adminRequired, function(req, res, next) {
  oa._performSecureRequest(null, null, "POST", rdioEndpoint, { "method": "getTopCharts", "type": "Track", "count": 10}, null, null, function(error, data, response) {
    if (data) {
      songs = JSON.parse(data).result;
      res.send(songs)
    }
  });
});

// admin view of room
app.get('/r/:room', adminRequired, function(req, res, next) {
  oa.post(rdioEndpoint, req.session.oauth_access_token, req.session.oauth_access_token_secret, 
    { "method" : "getPlaybackToken", "domain" : "twtbox.com" }, function (error, data) {
    var playbackToken = domain == "http://localhost:3000" ? "GAlNi78J_____zlyYWs5ZG02N2pkaHlhcWsyOWJtYjkyN2xvY2FsaG9zdEbwl7EHvbylWSWFWYMZwfc=" : JSON.parse(data)["result"];    
    
    var renderRoom = function(res, song, offset, playbackToken, domain) {
      res.render("room", {
        room: req.params.room,
        song: song,        
        mixpanel: mixpanel,
        offset: offset,
        playbackToken: playbackToken,
        domain: domain
      });
    };
    
    rclient.get(getPlaying(req.params.room), function(err, playing) {
      if (playing == undefined) {
        rclient.lpop(getSongs(req.params.room), function(err, song) {
          renderRoom(res, song, 0, playbackToken, domain);
        });
      } else {
        rclient.ttl(getPlaying(req.params.room), function(err, offset) {
          renderRoom(res, playing, offset, playbackToken, domain);
        });        
      }
    });
  });
});

// json representation of the queue for the receiver
app.get('/r/:room/queue.json', function(req, res, next) {  
  rclient.lrange(getSongs(req.params.room), 0, 100, function(err, queue) {
    res.send(queue);
  });
});

// redirect controller to queue screen
app.post('/join', function(req, res, next) {
  var room = req.body.room.toLowerCase();
  // if (room.length != 3) {
  //   req.flash('error', 'Party code must be 3 characters')
  //   res.redirect('/join')
  // } else {
    res.redirect('/r/' + req.body.room.toLowerCase() + '/q');
  // }
  
})

// controller screen for queuing songs
app.get('/r/:room/q', function(req, res, next) {  
  res.render('queue', {
    room: req.params.room,
  });
});

// Create a new name
app.post('/name', function(req, res, next) {
  var name = req.body.twtboxname.toLowerCase();
  
  sys.puts("Checking if " + name + " is already taken");
  
  rclient.sismember("rooms", name, function(err, reply) {
    if (reply == 1) {
      // TODO: display an error
      res.redirect('back');
    } else {
      res.redirect('/r/' + name);
    }
  });
});

// Admin routes
app.get('/logout', adminRequired, function(req, res, next) {
  req.session.oauth_access_token = undefined;
  req.session.oauth_access_token_secret = undefined;
  res.redirect('/');
});

app.get('/admin', adminRequired, function(req, res, next) {
  res.send('You are an admin');
});

// OAUTH STUFF
app.get('/authorize', getRequestToken, function(req, res, next) {
  res.redirect(req.loginUrl + '?oauth_token=' + req.session.token);
});

app.get('/callback', function(req, res, next) {
  req.session.verifier = req.query.oauth_verifier
  oa.getOAuthAccessToken(req.session.token, req.session.token_secret, req.session.verifier, 
    function(error, oauth_access_token, oauth_access_token_secret, results){
      if(error) sys.puts('error : ' + error)
      else {
        req.session.oauth_access_token = oauth_access_token;
        req.session.oauth_access_token_secret = oauth_access_token_secret;
        res.redirect('/create');
      }
    }
  );
});

// song has either a title or a key to queue, if its a title then do a search and queue it up, otherwise just queue up the key
var queueSong = function(song, room, client, callback) {
  var pushSong = function(s) {
    rclient.rpush(getSongs(room), JSON.stringify(s), function(err, reply) {
      mixTrack("queue", room, s);
      client.emit("queued", {song: s, room: room});
    });
  }
  
  if (song.key) {
    oa._performSecureRequest(null, null, "POST", rdioEndpoint, { "method": "get", "keys": song.key}, null, null, function(error, data, response) {
      if (data) {
        song = JSON.parse(data).result[song.key];
        pushSong(song);
        callback(room, song);
      }
    });
  } else if (song.title) {
    oa._performSecureRequest(null, null, "POST", rdioEndpoint, { "method": "search", "query": song.title, "types": "Track" }, null, null, function(error, data, response) {
      song = JSON.parse(data).result.results[0];
      if (song != undefined) {    
        pushSong(song);
        callback(room, song);
      } else {
        sys.puts("Couldn't find any songs for: '" + query + "'");
      }
    });    
  } else {
    sys.puts("No song to queue: " + sys.inspect(song));
  }
};

app.get('/suggestions', function(req, res, next) {
  var query = req.query.query;
  sys.puts("Performing search query for: " + query);
  oa._performSecureRequest(null, null, "POST", rdioEndpoint, { "method": "search", "query": query, "types": "Track,Album", "count": 10 }, null, null, function(error, data, response) {    
    if (data) {
      var d = JSON.parse(data);
      if (d.status == 'error') return undefined;
      var suggestions = d.result.results;
      // insert a value attribute for the autocomplete plugin
      suggestions = _.map(suggestions, function(suggestion) {
        if (suggestion.trackKeys) {
          suggestion.value = "Album: " + suggestion.name + " - " + suggestion.artist;
        } else {
          suggestion.value = suggestion.name + " - " + suggestion.artist;
        }
        return suggestion;
      });
      res.send(suggestions);
    }
  });
});

var mixTrack = function(action, room, song) {
  mp_client.track(action, {'room': room, 'artist': song.artist, 'title': song.name});        
};

socket.configure(function () { 
  socket.set("transports", ["xhr-polling"]); 
  socket.set("polling duration", 5);
  socket.set('log level', 1);
});

socket.sockets.on('connection', function(client) {
  /*
    Messages:
      {queue: {song: {title : "Song"}, room: "abcd"}}
      {queue: {song: {key: "t9393449"}, room: "abcd"}}
      {play: {song: {duration: 100, key: "abcd"}, room: "abcd"}}
      {next: {room: "abcd"}}
      {remove: {room: "abcd", song: {...}}}
  */
  client.on('queue', function(data) {    
    var broadcast = function(room, song) {
      client.broadcast.emit("queued", {room: room, song: song});
    }
    queueSong(data.song, data.room, client, broadcast);
  });
  client.on('next', function(data) {
    rclient.set(client.id, data.room, function(err, reply) {
      rclient.sadd("rooms", data.room, function(err, reply) {
    
      });
    });
    
    rclient.lpop(getSongs(data.room), function(err, song) {  
      client.emit("play", JSON.parse(song));
    });
  });
  client.on('play', function(data) {
    mixTrack("playback", data.room, data.song);
    rclient.setex(getPlaying(data.room), parseInt(data.song.duration), JSON.stringify(data.song), function(err, reply) {
      
    });
  });
  client.on('remove', function(data) {
    rclient.lrem(getSongs(data.room), 1, JSON.stringify(data.song), function(err, remove) {
      // removed..
    });
  });
  
  // Kill the queue and free up the jukebox name
  client.on("disconnect", function() {
    rclient.get(client.id, function(err, room) {
      sys.puts("Removing song queue from: " + getSongs(room));
      rclient.del(getSongs(room));
      rclient.del(getPlaying(room));
      sys.puts("Removing room from set: " + room);
      rclient.srem("rooms", room);
    });
    sys.puts("Removing client: " + client.id);
    rclient.del(client.id);
  });
});

var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Express server listening on port %d", port);
});

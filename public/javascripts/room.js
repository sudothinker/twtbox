$(document).ready(function() {
  $('#apiswf').bind('playingSourceChanged.rdio', function(e, playingSource) {
    // The currently playing source changed.
    // The source metadata, including a track listing is inside playingSource.
    if (playingSource == null) {
      playingSong = null;
      offset = 0;
      socket.emit("next", {"room": room});
    }
  });
  
  $('#apiswf').bind('playStateChanged.rdio', function(e, playState) {
     if(playState == 1) { // playing
       $('#pause').show();
       $('#play').hide();
      } else if (playState == 0) { //paused
        $('#pause').hide();
        $('#play').show();
      }

      if(playState == 1 && offset != 0) {
        $('#apiswf').rdio().seek(parseInt(playingSong.duration) - offset);
      }
  });

  $('#apiswf').bind('playingTrackChanged.rdio', function(e, playingTrack, sourcePosition) {
    // The currently playing track has changed.
    // Track metadata is provided as playingTrack and the position within the playing source as sourcePosition.
    if (playingTrack) {
      playingSong = playingTrack;
      $('#currentSong').text(playingTrack.name + " - " + playingTrack.artist);
    }
  });

  $('#apiswf').bind('positionChanged.rdio', function(e, position) {
    //The position within the track changed to position seconds.
    // This happens both in response to a seek and during playback.
    $("#progressbar").progressbar({ value: ((100*position) / parseInt(playingSong.duration)) });
  });
  socket.on("queued", function(data) { // Another client queued a song
    if (data.room == room) { // Only do something if this queue is for us, data queued will be broadcasted to everyone
      // potential performance problem here, but easier than keep track of clients and sending it to specific ones.
      if (Queue.length == 0 && playingSong == null) { 
        // we aren't playing anything right now, and there is nothing queued
        socket.emit("next", {room: room});
      } else {
        Queue.add(new Song(data.song));
      }
    }
  });
  socket.on("play", function(data) {
    if (data) {
      Queue.remove(Queue.at(0));
      playingSong = new Song(data);
      $('#apiswf').rdio().play(data.key);
      sendPlay(); // play this song
    } else { // nothing left in the queue
      $('#currentSong').text('No songs queued');
    }
  });
  
  $('#progressbar').progressbar({value: 0});
  $('#mute').click(function() {
    $('#apiswf').rdio_setMute(true);
  });
  $('#unmute').click(function() {
    $('#apiswf').rdio_setMute(false);
  });
  $('#play').click(function() {
    $('#apiswf').rdio().play();
  });
  $('#pause').click(function() {
    $('#apiswf').rdio().pause();
  });
  
  $.get("/topsongs.json", function(response) {
    _.each(response, function(song) {      
      $('#topSongs').append("<li><a href=\"\" data-key=\"" + song.key + "\" class=\"topSong\">" + song.name + " - " + song.artist + "</a></li>");
    });
    $('.topSong').click(function() {
      socket.emit("queue", {"song": {"key": $(this).attr('data-key')}, "room": $('#room').val()});
      return false;
    })
  });
  // $.get("http://api.bitly.com/v3/shorten?login=sudothinker&apiKey=R_16070e6ca4daade9543bdaee2c120637&format=json&longUrl=" + 
  //   escape(window.location + "/q"), function(data) {
  //   var shortUrl = data.data.url;
  //   $("#share-url").text(shortUrl);
  //   $("#qr-code").attr('src', shortUrl + ".qrcode");
  // });
});
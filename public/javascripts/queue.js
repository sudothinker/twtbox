$(function() {
  window.Song = Backbone.Model.extend({
    clear: function() {
      this.view.remove();
    }
  });

  window.SongView = Backbone.View.extend({
    tagName: "li",
    template: _.template($('#song-template').html()),

    events: {
      "click .delete" : "delete"
    },

    initialize: function() {
      this.model.view = this;
    },

    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      return this;
    },

    delete: function() {
      $(this.el).remove();
      socket.emit("remove", {song: this.model, room: room});
      Queue.remove(this.model);
    }
  });

  window.Queue = Backbone.Collection.extend({
    model: Song,
    fetch: function() {
      $.get(window.location + "/queue.json", function(response) {
        _.each(response, function(song) {
          Queue.add(new Song(JSON.parse(song)));
        });
      });
    }
  });

  window.Queue = new Queue;
  window.QueueView = Backbone.View.extend({
    el: $('#queue'),

    initialize: function() {
      Queue.bind('add', this.addOne);
      Queue.bind('remove', this.removeOne);
      Queue.fetch();
    },

    removeOne: function(song) {
      song.clear();
    },

    addOne: function(song) {
      var songView = new SongView({model: song});
      $('#queue').append(songView.render().el);
    }
  });

  window.QueueApp = new QueueView({model: Queue});
});
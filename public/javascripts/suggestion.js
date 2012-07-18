$(function() {
  window.Suggestion = Backbone.Model.extend({
  });

  window.SuggestionView = Backbone.View.extend({
    tagName: "li",
    template: _.template($('#suggestion-template').html()),

    initialize: function() {
      this.model.view = this;
    },

    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      return this;
    }
  });

  window.Suggestions = Backbone.Collection.extend({
    model: Suggestion
  });

  window.Suggestions = new Suggestions;
  window.SuggestionsView = Backbone.View.extend({
    el: $('#suggestions'),

    initialize: function() {
      Suggestions.bind('refresh', this.refreshAll);
    },

    refreshAll: function(suggestions) {
      $('#suggestions').empty();
      _.each(suggestions.models, function(suggestion) {
        var suggestionView = new SuggestionView({model: suggestion});
        $('#suggestions').append(suggestionView.render().el);
      });
    }
  });

  window.SuggestionsApp = new SuggestionsView({model: Suggestions});
});
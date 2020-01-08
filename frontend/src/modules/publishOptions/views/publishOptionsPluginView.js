// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');

  var PublishOptionsPluginView = OriginView.extend({
    tagName: 'div',
    className: 'col-row tb-row',
    initialize: function(options) {
      this.listenTo(Origin, 'publishOptions:pluginView:remove', this.remove);
      this.options = options;
      this.render();
    },

    events: {
      'click .edit-plugin': 'onEditPlugin',
      'click .toggle-plugin': 'onTogglePlugin'
    },

    render: function() {
      var template = Handlebars.templates[this.constructor.template];
      this.$el.html(template(this.options.data));
    },

    postRender: function() {
      var pluginEnabled = data.pluginEnabled
      var $publishControls = this.$('#publish-controls');
      if (pluginEnabled) {
        $optionsList.find('.toggle-plugin').toggleClass('display-none', true);
      } else {
        $optionsList.find('.edit-plugin').toggleClass('display-none', true);
      }
    },

    onEditPlugin: function(event) {
      event && event.preventDefault();
      var pluginId = $(event.currentTarget).attr('data-id');
      var pluginName = $(event.currentTarget).attr('data-name');
      var plugin = {
        id: pluginId,
        name: pluginName
      }
      Origin.trigger('publishOptions:editPlugin', plugin);
    },

    onTogglePlugin: function(event) {
      Origin.trigger('publishOptions:togglePlugin', this.options.data);
    }
  }, {
    template: 'publishOptionsPluginView'
  });

  return PublishOptionsPluginView;
});

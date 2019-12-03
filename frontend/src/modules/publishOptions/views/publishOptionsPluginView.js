// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var OriginView = require('core/views/originView');

  var PublishOptionsPluginView = OriginView.extend({
    tagName: 'div',
    className: 'col-row tb-row',
    initialize: function(options) {
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
      console.log('onEditPlugin');
    },

    onTogglePlugin: function(event) {
      console.log('onTogglePlugin');
    }
  }, {
    template: 'publishOptionsPluginView'
  });

  return PublishOptionsPluginView;
});

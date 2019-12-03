// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');

  var PublishOptionsSidebarView = SidebarItemView.extend({
    events: {
      'click button.cancel': 'goBack',
      'click button.save': 'publishCourse'
    },

    publishCourse: function(event) {
      event && event.preventDefault();
      Origin.trigger('editorCommon:download', this);
    },

    goBack: function(event) {
      event && event.preventDefault();
      Origin.trigger('publishOptions:cancel', this);
    }
  }, {

    template: 'publishOptionsSidebar'

  });

  return PublishOptionsSidebarView;

});

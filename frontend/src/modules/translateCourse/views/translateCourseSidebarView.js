define(function(require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');

  var ProjectsSidebarView = SidebarItemView.extend({

    events: {
      'click .editor-project-translate-sidebar-translate': 'translateCourse',
      'click .editor-project-translate-sidebar-cancel': 'cancel'
    },

    translateCourse: function(event) {
      event && event.preventDefault();
      Origin.trigger('translateCourseSidebar:views:translate', this);
    },

    cancel: function(event) {
      event && event.preventDefault();
      Backbone.history.history.back();
    }

  }, {
    template: 'translateCourseSidebar'
  });

  return ProjectsSidebarView;
});

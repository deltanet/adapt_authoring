define(function(require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');

  var ProjectsSidebarView = SidebarItemView.extend({

    events: {
      'click button.translate': 'translateCourse',
      'click button.cancel': 'goBack'
    }


  }, {
    template: 'translateCourseSidebar'
  });

  console.log('translate course sidebar view');
  return ProjectsSidebarView;
});

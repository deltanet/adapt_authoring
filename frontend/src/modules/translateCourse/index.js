define(function(require) {
  const Origin = require('core/origin');
  const CourseModel = require('core/models/courseModel');
  const TranslateCourseView = require('./views/translateCourseView');
  const TranslateCourseSidebarView = require('./views/translateCourseSidebarView');


  Origin.on('router:translatecourse', function(location, subLocation, action) {
    console.log(location)
    console.log(subLocation)
    console.log(action)
    if(location) return loadtranslateCourseView();
    //if(location === 'dictionarylookup') return loadDictionaryView();
    //if(location === 'charactercount') return loadCharacterCountView();

    function loadtranslateCourseView() {
      console.log('navigate to translate course')
      Origin.trigger('location:title:update', { title: Origin.l10n.t('app.translatecourse')});
      Origin.sidebar.addView(new TranslateCourseSidebarView().$el);
      Origin.contentPane.setView(TranslateCourseView, { model: {} });
    }

  });

});

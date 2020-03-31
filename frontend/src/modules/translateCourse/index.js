define(function(require) {
  const Origin = require('core/origin');
  const CourseModel = require('core/models/courseModel');
  const TranslateCourseView = require('./views/translateCourseView');
  const TranslateCourseSidebarView = require('./views/translateCourseSidebarView');

  let courseId;

  Origin.on('router:translatecourse', function(location, subLocation, action) {
    if(location) {
      courseId = location;
      return getAvailableLanguages();
    }
    //if(location === 'dictionarylookup') return loadDictionaryView();
    //if(location === 'charactercount') return loadCharacterCountView();

    function getAvailableLanguages() {
      if (!courseId) return notifyErrorAlert('app.translateErrorTitle', 'app.errorgettinglanguages');
      $.ajax({
        url: 'api/translate/languages',
        type: 'GET',
        success: function(data) {
          if (typeof data !== 'object' || !data.translation) {
            notifyErrorAlert('app.translateErrorTitle', 'app.errorgettinglanguages');
          }
          transformLanguageData(data.translation);
        },
        error: function(data) {
          notifyErrorAlert('app.translateErrorTitle', data.message);
        }
      });
    }

    function notifyErrorAlert(title, message) {
      Origin.Notify.alert({
        type: 'error',
        text: Origin.l10n.t(title, { message: message })
      });
    }

    function getCourseData(translationData) {
      //let courseTitle;
      let courseModel = new CourseModel({ _id: courseId }).fetch({
        success: function(model) {
          translationData.courseId = model.get('_id');
          translationData.courseTitle = model.get('title');

          let translationModel = new Backbone.Model(translationData);
          return loadtranslateCourseView(translationModel);
        },
        error: function(error) {
          return notifyErrorAlert('app.translateErrorTitle', 'app.errorgettinglanguages')
        }
      });
    }

    function transformLanguageData(languageData) {
      if (!languageData || typeof languageData !== 'object') return notifyErrorAlert('app.translateErrorTitle', 'app.errorgettinglanguages');
      let langArray = [];

      Object.keys(languageData).map(lang => {
        let transformedLang = {
          langCode: lang,
          dir: languageData[lang].dir,
          name:languageData[lang].name,
          nativeName: languageData[lang].nativeName
        }
        langArray.push(transformedLang);
      });

      let translationData = {
        languages: langArray
      }
      return getCourseData(translationData);
    }


    function loadtranslateCourseView(model) {
      Origin.trigger('location:title:update', { title: Origin.l10n.t('app.translatecourse')});
      Origin.sidebar.addView(new TranslateCourseSidebarView().$el);
      Origin.contentPane.setView(TranslateCourseView, { model: model });
    }
  });
});

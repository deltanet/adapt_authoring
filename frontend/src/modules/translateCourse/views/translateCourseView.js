define(function(require) {
  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var OriginView = require('core/views/originView');
  var Origin = require('core/origin');


  var TranslateCourseView = OriginView.extend({
    tagName: 'div',
    className: 'translate-course',

    preRender: function() {
      this.listenTo(Origin, 'translateCourseSidebar:views:translate', this.translateCourse);
    },

    render: function() {
      OriginView.prototype.render.apply(this, arguments);
      return this;
    },

    translateCourse: function(sidebarView){
      if(!this.isValid()) return;
      this.sidebarView = sidebarView;
      this.sidebarView.updateButton('.editor-project-translate-sidebar-translate', Origin.l10n.t('app.translating'));
      var $translateForm = this.$('form.translateCourse');
      $translateForm.attr('action', 'api/translate/course/' + this.model.get('courseId'));
      $translateForm.ajaxSubmit({
        error: this.onAjaxError.bind(this),
        success: this.onFormSubmitSuccess.bind(this)
      });
    },

    isValid: function() {
      let langTitleError = this.$('.lang-container-title').find('span.error');
      let validated = true;
      if (!this.$("input[name='targetLang']").is(':checked')) {
        validated = false
        $(langTitleError).text(Origin.l10n.t('app.pleaseselectlanguage'));
      } else {
        $(langTitleError).text('');
      }
      return validated;
    },

    onFormSubmitSuccess: function(data, importStatus, importXhr) {
      if (!data.newCourseId) return Origin.router.navigateToHome();
      Origin.router.navigateTo('editor/' + data.newCourseId + '/menu');
    },

    onAjaxError: function(data, status, error) {
      var resJson = data.responseJSON || {};
      var title = resJson.title || Origin.l10n.t('app.translateErrorTitle');
      var msg = resJson.body && resJson.body.replace(/\n/g, "<br />") || error;
      this.promptUser(title, msg, true);
      this.sidebarView.resetButtons();
    },

    promptUser: function(title, message, isError) {
      Origin.trigger('sidebar:resetButtons');
      Origin.Notify.alert({
        type: (!isError) ? 'success' : 'error',
        title: title,
        text: message
      });
    },

  }, {
    template: 'translateCourse'
  });

  return TranslateCourseView;

});

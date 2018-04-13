// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var _ = require('underscore');
  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var OriginView = require('core/views/originView');
  var Origin = require('core/origin');
  var Helpers = require('core/helpers');

  var ProjectView = OriginView.extend({
    className: 'project-list-item',
    tagName: 'li',

    events: {
      'dblclick': 'editProject',
      'click': 'selectProject',
      'click a.open-context-course': 'openContextMenu',
      'click a.download-project': 'startDownloadProject',
      'click a.course-delete': 'deleteProjectPrompt',
      'click .projects-details-tags-button-show': 'onProjectShowTagsButtonClicked',
      'click .projects-details-tags-button-hide': 'onProjectHideTagsButtonClicked',
    },

    preRender: function() {
      this.listenTo(this, {
        'remove': this.remove,
        'contextMenu:course:editSettings': this.editProjectSettings,
        'contextMenu:course:edit': this.editProject,
        'contextMenu:course:delete': this.deleteProjectPrompt,
        'contextMenu:course:copy': this.duplicateProject,
        'contextMenu:course:copyID': this.copyIdToClipboard,
        'contextMenu:course:cleanassets': this.cleanAssets
      });
      this.listenTo(Origin, {
        'dashboard:dashboardView:removeSubViews': this.remove,
        'dashboard:projectView:itemSelected': this.deselectItem,
        'dashboard:dashboardView:deselectItem': this.deselectItem
      });
      this.listenTo(Origin, 'editorView:deleteProject:' + this.model.get('_id'), this.deleteProject);

      this.model.set('heroImageURI', this.model.getHeroImageURI());
    },

    openContextMenu: function(event) {
      if(event) {
        event.stopPropagation();
        event.preventDefault();
      }
      Origin.trigger('contextMenu:open', this, event);
    },

    editProjectSettings: function(event) {
      event && event.preventDefault();
      Origin.router.navigateTo('editor/' + this.model.get('_id') + '/settings');
    },

    editProject: function(event) {
      event && event.preventDefault();
      Origin.router.navigateTo('editor/' + this.model.get('_id') + '/menu');
    },

    startDownloadProject: function(event) {
      event && event.preventDefault();
      this.validateProject(_.bind(this.downloadProject, this));
    },

    validateProject: function(next) {
      Helpers.validateCourseContent(this.model, _.bind(function(error) {
        if(error) {
          Origin.Notify.alert({ type: 'error', text: "There's something wrong with your course:<br/><br/>" + error });
        }
        next(this, error);
      }, this));
    },

    downloadProject: function() {
      if(Origin.editor.isDownloadPending) {
        return;
      }
      var courseId = this.model.get('_id');
      $('.project-inner[data-id="' + courseId + '"]').find('.download-icon').addClass('display-none');
      $('.project-inner[data-id="' + courseId + '"]').find('.downloading-icon').removeClass('display-none');
      $('.projects-inner').addClass('downloading');
      $('.project-list-item').addClass('downloading');

      $.get('/api/output/' + Origin.constants.outputPlugin + '/publish/' + courseId, _.bind(function(jqXHR, textStatus, errorThrown) {

        if (!jqXHR.success) {
          Origin.Notify.alert({ type: 'error', text: Origin.l10n.t('app.errorgeneric') });
          this.resetDownloadProgress(courseId);
          return;
        }
        if (jqXHR.payload && typeof(jqXHR.payload.pollUrl) !== undefined && jqXHR.payload.pollUrl) {
          // Ping the remote URL to check if the job has been completed
          this.updateDownloadProgress(courseId, jqXHR.payload.pollUrl);
          return;
        }
        this.resetDownloadProgress(courseId);

        var $downloadForm = $('#downloadForm');
        $downloadForm.attr('action', '/download/' + Origin.sessionModel.get('tenantId') + '/' + courseId + '/' + jqXHR.payload.zipName + '/download.zip');
        $downloadForm.submit();

      }, this)).fail(_.bind(function (jqXHR, textStatus, errorThrown) {
        this.resetDownloadProgress(courseId);
        Origin.Notify.alert({ type: 'error', text: Origin.l10n.t('app.errorgeneric') });
      }, this));
    },

    resetDownloadProgress: function(id) {
      $('.project-inner[data-id="' + id + '"]').find('.download-icon').removeClass('display-none');
      $('.project-inner[data-id="' + id + '"]').find('.downloading-icon').addClass('display-none');
      $('.projects-inner').removeClass('downloading');
      $('.project-list-item').removeClass('downloading');
      Origin.editor.isDownloadPending = false;
    },

    updateDownloadProgress: function(id, url) {
      // Check for updated progress every 3 seconds
      var pollId = setInterval(_.bind(function pollURL() {
        $.get(url, function(jqXHR, textStatus, errorThrown) {
          if (jqXHR.progress < "100") {
            return;
          }
          clearInterval(pollId);
          this.resetDownloadProgress(id);
        }).fail(function(jqXHR, textStatus, errorThrown) {
          clearInterval(pollId);
          this.resetDownloadProgress(id);
          Origin.Notify.alert({ type: 'error', text: errorThrown });
        });
      }, this), 3000);
    },

    selectProject: function(event) {
      event && event.preventDefault();
      this.selectItem();
    },

    selectItem: function() {
      Origin.trigger('dashboard:projectView:itemSelected');
      this.$el.addClass('selected');
      this.model.set({ _isSelected: true });
    },

    deselectItem: function() {
      this.$el.removeClass('selected');
      this.model.set({ _isSelected: false });
    },

    deleteProjectPrompt: function(event) {
      event && event.preventDefault();
      if(this.model.get('_isShared') === true) {
        Origin.Notify.confirm({
          type: 'warning',
          title: Origin.l10n.t('app.deletesharedproject'),
          text: Origin.l10n.t('app.confirmdeleteproject') + '<br/><br/>' + Origin.l10n.t('app.confirmdeletesharedprojectwarning'),
          destructive: true,
          callback: _.bind(this.deleteProjectConfirm, this)
        });
        return;
      }
      Origin.Notify.confirm({
        type: 'warning',
        title: Origin.l10n.t('app.deleteproject'),
        text: Origin.l10n.t('app.confirmdeleteproject') + '<br/><br/>' + Origin.l10n.t('app.confirmdeleteprojectwarning'),
        callback: _.bind(this.deleteProjectConfirm, this)
      });
    },

    deleteProjectConfirm: function(confirmed) {
      if (confirmed) {
        var id = this.model.get('_id');
        Origin.trigger('editorView:deleteProject:' + id);
      }
    },

    deleteProject: function(event) {
      this.model.destroy({
        success: _.bind(this.remove, this),
        error: function(model, response, options) {
          _.delay(function() {
            Origin.Notify.alert({ type: 'error', text: response.responseJSON.message });
          }, 1000);
        }
      });
    },

    duplicateProject: function() {
      $.ajax({
        url: this.model.getDuplicateURI(),
        success: function (data) {
          Origin.router.navigateTo('editor/' + data.newCourseId + '/settings');
        },
        error: function() {
          Origin.Notify.alert({ type: 'error', text: Origin.l10n.t('app.errorduplication') });
        }
      });
    },

    copyIdToClipboard: function() {
      var id = this.model.get('_id');
      if(Helpers.copyStringToClipboard(id)) {
        Origin.Notify.alert({ type: 'success', text: Origin.l10n.t('app.copyidtoclipboardsuccess', { id: id }) });
        return;
      }
      Origin.Notify.alert({ type: 'warning', text: Origin.l10n.t('app.app.copyidtoclipboarderror', { id: id }) });
    },

    onProjectShowTagsButtonClicked: function(event) {
      if(event) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.$('.tag-container').show().velocity({ opacity: 1 });
    },

    onProjectHideTagsButtonClicked: function(event) {
      if(event) {
        event.preventDefault();
        event.stopPropagation();
      }
      this.$('.tag-container').velocity({ opacity: 0 }).hide();
    },

    cleanAssets: function() {
      // aleady processing, don't try again
      if(this.exporting) return;

      this.$el.css('cursor', 'progress');

      var courseId = this.model.get('_id');
      var tenantId = Origin.sessionModel.get('tenantId');

      this.exporting = true;

      var self = this;
      $.ajax({
         url: '/api/cleanassets/course/' + courseId,
         success: function(data, textStatus, jqXHR) {
           var messageText = Origin.l10n.t('app.cleanassetsmessage');
           self.exporting = false;
           self.$el.css('cursor', 'default');
           Origin.Notify.alert({
             type: 'success',
             title: Origin.l10n.t('app.cleanassetssuccess'),
             text: messageText
           });
         },
         error: function(jqXHR, textStatus, errorThrown) {
           var messageText = errorThrown;
           if(jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.message) messageText += ':<br/>' + jqXHR.responseJSON.message;
           self.exporting = false;
           self.$el.css('cursor', 'default');
           Origin.Notify.alert({
             type: 'error',
             title: Origin.l10n.t('app.cleanassetsfailed'),
             text: messageText
           });
         }
      });
    }
  }, {
    template: 'project'
  });

  return ProjectView;
});

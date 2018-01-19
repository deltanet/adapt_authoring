// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/*
 * TODO I think this exists to add extra functionality to the menu/page structure pages
 */
define(function(require) {
  var Backbone = require('backbone');
  var Origin = require('core/origin');
  var helpers = require('core/helpers');

  var EditorOriginView = require('./editorOriginView');
  var EditorMenuView = require('../../contentObject/views/editorMenuView');
  var EditorPageView = require('../../contentObject/views/editorPageView');

  var ContentObjectModel = require('core/models/contentObjectModel');
  var ArticleModel = require('core/models/articleModel');
  var BlockModel = require('core/models/blockModel');
  var ComponentModel = require('core/models/componentModel');

  var EditorView = EditorOriginView.extend({
    className: "editor-view",
    tagName: "div",

    settings: {
      autoRender: false
    },
    exporting: false,

    events: {
      "click a.page-add-link": "addNewPage",
      "click a.load-page": "loadPage",
      "mouseover div.editable": "onEditableHoverOver",
      "mouseout div.editable": "onEditableHoverOut"
    },

    preRender: function(options) {
      this.currentView = options.currentView;
      Origin.editor.isPreviewPending = false;
      this.currentCourseId = Origin.editor.data.course.get('_id');
      this.currentCourse = Origin.editor.data.course;
      this.currentPageId = options.currentPageId;

      this.listenTo(Origin, {
        'editorView:refreshView': this.setupEditor,
        'editorView:copy': this.addToClipboard,
        'editorView:copyID': this.copyIdToClipboard,
        'editorView:paste': this.pasteFromClipboard,
        'editorCommon:download': function(event) {
          this.validateProject(event, this.downloadProject);
        },
        'editorCommon:preview': function(event) {
          var previewWindow = window.open('/loading', 'preview');
          this.validateProject(event, function(error) {
            if(error) {
              return previewWindow.close();
            }
            this.previewProject(previewWindow);
          });
        },
        'editorCommon:export': function(event) {
          this.validateProject(event, this.exportProject);
        }
      });

      this.render();
      this.setupEditor();
    },

    postRender: function() {

    },

    setupEditor: function() {
      this.renderCurrentEditorView();
    },

    validateProject: function(e, next) {
      e && e.preventDefault();

      var self = this;

      if (helpers.validateCourseContent(this.currentCourse) && !Origin.editor.isDownloadPending) {
        $('.editor-common-sidebar-download-inner').addClass('display-none');
        $('.editor-common-sidebar-downloading').removeClass('display-none');

        var courseId = Origin.editor.data.course.get('_id');
        var tenantId = Origin.sessionModel.get('tenantId');

        $.ajax({
          method: 'get',
          url: '/api/output/' + Origin.constants.outputPlugin + '/publish/' + this.currentCourseId,
          success: function (jqXHR, textStatus, errorThrown) {
            if (jqXHR.success) {
              if (jqXHR.payload && typeof(jqXHR.payload.pollUrl) != 'undefined' && jqXHR.payload.pollUrl != '') {
                // Ping the remote URL to check if the job has been completed
                self.updateDownloadProgress(jqXHR.payload.pollUrl);
              } else {
                self.resetDownloadProgress();

                var $downloadForm = $('#downloadForm');

                $downloadForm.attr('action', '/download/' + tenantId + '/' + courseId + '/' + jqXHR.payload.zipName + '/download.zip');
                $downloadForm.submit();
              }
            } else {
              self.resetDownloadProgress();

              Origin.Notify.alert({
                type: 'error',
                text: Origin.l10n.t('app.errorgeneric')
              });
            }
          },
          error: function (jqXHR, textStatus, errorThrown) {
            self.resetDownloadProgress();

            Origin.Notify.alert({
              type: 'error',
              text: Origin.l10n.t('app.errorgeneric')
            });
          }
        });
      } else {
        return false;
      }
    },

    exportProject: function(devMode) {
      // TODO - very similar to export in project/views/projectView.js, remove duplication
      // aleady processing, don't try again
      if(this.exporting) return;

      var courseId = Origin.editor.data.course.get('_id');
      var tenantId = Origin.sessionModel.get('tenantId');

      var $btn = devMode == true ? $('button.editor-common-sidebar-export-dev') : $('button.editor-common-sidebar-export');

      this.showExportAnimation(true, $btn);
      this.exporting = true;

      var self = this;
      $.ajax({
         url: '/export/' + tenantId + '/' + courseId + '/' + devMode,
         success: function(data, textStatus, jqXHR) {
           self.showExportAnimation(false, $btn);
           self.exporting = false;

           // get the zip
           var form = document.createElement('form');
           self.$el.append(form);
           form.setAttribute('action', '/export/' + tenantId + '/' + courseId + '/download.zip');
           form.submit();
         },
         error: function(jqXHR, textStatus, errorThrown) {
           var messageText = errorThrown;
           if(jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.message) messageText += ':<br/>' + jqXHR.responseJSON.message;

           self.showExportAnimation(false, $btn);
           self.exporting = false;

           Origin.Notify.alert({
             type: 'error',
             title: Origin.l10n.t('app.exporterrortitle'),
             text: messageText
           });
         }
      });
    },

    showExportAnimation: function(show, $btn) {
      if(show !== false) {
        $('.editor-common-sidebar-export-inner', $btn).addClass('display-none');
        $('.editor-common-sidebar-exporting', $btn).removeClass('display-none');
      } else {
        $('.editor-common-sidebar-export-inner', $btn).removeClass('display-none');
        $('.editor-common-sidebar-exporting', $btn).addClass('display-none');
      }
      this.showExportAnimation();
      this.exporting = true;

      var courseId = Origin.editor.data.course.get('_id');
      var tenantId = Origin.sessionModel.get('tenantId');

      $.get('/export/' + tenantId + '/' + courseId, _.bind(function(data, textStatus, jqXHR) {
      // success
        var form = document.createElement('form');
        this.$el.append(form);
        form.setAttribute('action', '/export/' + tenantId + '/' + courseId + '/' + data.zipName + '/download.zip');
        form.submit();
      }, this)).fail(_.bind(function(jqXHR, textStatus, errorThrown) {
      // failure
        var messageText = errorThrown;
        if(jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.message) {
          messageText += ':<br/>' + jqXHR.responseJSON.message;
        }
        Origin.Notify.alert({
          type: 'error',
          title: Origin.l10n.t('app.exporterrortitle'),
          text: messageText
        });
      }, this)).always(_.bind(function() {
      // always
        this.showExportAnimation(false);
        this.exporting = false;
      }, this));
    },

    updatePreviewProgress: function(url, previewWindow) {
      var self = this;

      var pollUrl = function() {
        $.get(url, function(jqXHR, textStatus, errorThrown) {
          if (jqXHR.progress < "100") {
            return;
          }
          clearInterval(pollId);
          self.updateCoursePreview(previewWindow);
          self.resetPreviewProgress();
        }).fail(function(jqXHR, textStatus, errorThrown) {
          clearInterval(pollId);
          self.resetPreviewProgress();
          Origin.Notify.alert({ type: 'error', text: errorThrown });
          previewWindow.close();
        });
      }
      // Check for updated progress every 3 seconds
      var pollId = setInterval(pollUrl, 3000);
    },

    updateDownloadProgress: function(url) {
      // Check for updated progress every 3 seconds
      var pollId = setInterval(_.bind(function pollURL() {
        $.get(url, function(jqXHR, textStatus, errorThrown) {
          if (jqXHR.progress < "100") {
            return;
          }
          clearInterval(pollId);
          this.resetDownloadProgress();
        }).fail(function(jqXHR, textStatus, errorThrown) {
          clearInterval(pollId);
          this.resetDownloadProgress();
          Origin.Notify.alert({ type: 'error', text: errorThrown });
        });
      }, this), 3000);
    },

    resetPreviewProgress: function() {
      $('.editor-common-sidebar-preview-inner').removeClass('display-none');
      $('.editor-common-sidebar-previewing').addClass('display-none');
      $('.navigation-loading-indicator').addClass('display-none');
      Origin.editor.isPreviewPending = false;
    },

    resetDownloadProgress: function() {
      $('.editor-common-sidebar-download-inner').removeClass('display-none');
      $('.editor-common-sidebar-downloading').addClass('display-none');
      Origin.editor.isDownloadPending = false;
    },

    showExportAnimation: function(show) {
      if(show !== false) {
        $('.editor-common-sidebar-export-inner').addClass('display-none');
        $('.editor-common-sidebar-exporting').removeClass('display-none');
      } else {
        $('.editor-common-sidebar-export-inner').removeClass('display-none');
        $('.editor-common-sidebar-exporting').addClass('display-none');
      }
    },

    updateCoursePreview: function(previewWindow) {
      var courseId = Origin.editor.data.course.get('_id');
      var tenantId = Origin.sessionModel.get('tenantId');
      previewWindow.location.href = '/preview/' + tenantId + '/' + courseId + '/';
    },

    addToClipboard: function(model) {
      var postData = {
        objectId: model.get('_id'),
        courseId: Origin.editor.data.course.get('_id'),
        referenceType: model._siblingTypes
      };
      $.post('/api/content/clipboard/copy', postData, _.bind(function(jqXHR) {
        Origin.editor.clipboardId = jqXHR.clipboardId;
        this.showPasteZones(model.get('_type'));
      }, this)).fail(_.bind(function (jqXHR, textStatus, errorThrown) {
        Origin.Notify.alert({
          type: 'error',
          text: Origin.l10n.t('app.errorcopy') + (jqXHR.message ? '\n\n' + jqXHR.message : '')
        });
        this.hidePasteZones();
      }, this));
    },

    copyIdToClipboard: function(model) {
      var id = model.get('_id');

      if (helpers.copyStringToClipboard(id)) {
        Origin.Notify.alert({
          type: 'success',
          text: Origin.l10n.t('app.copyidtoclipboardsuccess', { id: id })
        });
      } else {
        Origin.Notify.alert({
          type: 'warning',
          text: Origin.l10n.t('app.app.copyidtoclipboarderror', { id: id })
        });
      }
    },

    pasteFromClipboard: function(parentId, sortOrder, layout) {
      Origin.trigger('editorView:pasteCancel');
      var postData = {
        id: Origin.editor.clipboardId,
        parentId: parentId,
        layout: layout,
        sortOrder: sortOrder,
        courseId: Origin.editor.data.course.get('_id')
      };
      $.post('/api/content/clipboard/paste', postData, function(data) {
        Origin.editor.clipboardId = null;
        Origin.trigger('editorView:pasted:' + postData.parentId, {
          _id: data._id,
          sortOrder: postData.sortOrder
        });
      }).fail(function(jqXHR, textStatus, errorThrown) {
        Origin.Notify.alert({
          type: 'error',
          text: Origin.l10n.t('app.errorpaste') + (jqXHR.message ? '\n\n' + jqXHR.message : '')
        });
      });
    },

    createModel: function (type) {
      var model;
      switch (type) {
        case 'contentObjects':
          model = new ContentObjectModel();
          break;
        case 'articles':
          model = new ArticleModel();
          break;
        case 'blocks':
          model = new BlockModel();
          break;
        case 'components':
          model = new ComponentModel();
          break;
      }
      return model;
    },

    renderCurrentEditorView: function() {
      Origin.trigger('editorView:removeSubViews');

      if(this.currentView === 'menu') {
        this.renderEditorMenu();
      } else if(this.currentView === 'page') {
        this.renderEditorPage();
      }

      Origin.trigger('editorSidebarView:addOverviewView');
    },

    renderEditorMenu: function() {
      var view = new EditorMenuView({ model: Origin.editor.data.course });
      this.$('.editor-inner').html(view.$el);
    },

    renderEditorPage: function() {
      (new ContentObjectModel({
        _id: this.currentPageId
      })).fetch({
        success: function(model) {
          var view = new EditorPageView({ model: model });
          this.$('.editor-inner').html(view.$el);
        },
        error: function() {
          Origin.Notify.alert({
            type: 'error',
            text: 'app.errorfetchingdata'
          });
        }
      });
    },

    /**
    * Event handling
    */

    onEditableHoverOver: function(e) {
      e && e.stopPropagation();
      $(e.currentTarget).addClass('hovering');
    },

    onEditableHoverOut: function(e) {
      $(e.currentTarget).removeClass('hovering');
    }
  }, {
    template: 'editor'
  });

  return EditorView;
});

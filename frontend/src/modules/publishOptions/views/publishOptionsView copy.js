// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var ExtensionTypeModel = require('core/models/extensionTypeModel');
  var EditorCollection = require('../../editor/global/collections/editorCollection');
  var ConfigModel = require('core/models/configModel');
  var Helpers = require('core/helpers');

  var PublishOptionsView = OriginView.extend({
    tagName: 'div',
    className: 'publishOptions',
    createdCourseId: false,

    preRender: function() {

      this.currentCourseId = Origin.location.route1;  // TODO - this should be got from data returned from ajax call to publishoptions end point. Which should also return validation data.
      Origin.trigger('location:title:update', { title: Origin.l10n.t('app.download') });
      this.listenTo(Origin, { 'editorCommon:download': this.downloadProject });
      this.listenTo(Origin, { 'publishOptions:cancel': this.cancelDownload });
      this.getConfig(function() {
        console.log('getConfig callback');
      });
    },

    postRender: function() {
      this.setViewToReady();
    },

    setupExtensions: function(configData, callback) {
      var _this = this;
      var enabledExtensions = _.pluck(configData, '_enabledExtensions') ;
      console.log('enabledExtensions !! ' + JSON.stringify(enabledExtensions));
      var flattenedExt = Helpers.flattenNestedProperties(enabledExtensions)
      var enabledExtensionNames = _.pluck(_.toArray(flattenedExt), 'name');
      console.log('enabledExtensionNames ' + JSON.stringify(enabledExtensionNames));
      var trackingExtensionNames = ['adapt-contrib-xapi', 'adapt-contrib-spoor'];
      var enabledExtensions = [];
      var disabledExtensions = [];
      var allExtensions = Origin.editor.data.extensiontypes;
      var extensionTypes = new EditorCollection(null, {
        autoFetch: true,
        model: ExtensionTypeModel,
        url: ExtensionTypeModel.prototype.urlRoot,
        _type: 'extension'
      });

      extensionTypes.fetch({
        success: function() {
          extensionTypes.each(function(model) {
            var extension = model.toJSON();

            // only add tracking extensions
            if (_.indexOf(trackingExtensionNames, extension.name) > -1) {
              console.log('#### - extension name: ' + extension.name);
              if (_.indexOf(enabledExtensionNames, extension.name) > -1) {
                enabledExtensions.push(extension);
              } else if (extension._isAvailableInEditor) {
                disabledExtensions.push(extension);
              }
            }
          });

          _this.model.set({
            enabledExtensions: enabledExtensions,
            availableExtensions: disabledExtensions
          });

          if(callback){
            console.log('enabledExtensions ' + JSON.stringify(enabledExtensions));
            console.log('disabledExtensions ' + JSON.stringify(disabledExtensions));
            return callback();
          }
        },
        error: function(err) {
          if(callback){
            return callback(err);
          }
        }
      })
    },

    getConfig: function(callback) {
      _this = this;
      (new ConfigModel({ _courseId: Origin.location.route1 })).fetch({
        success: function(model) {
          //var form = Origin.scaffold.buildForm({ model: model });
          _this.setupExtensions(model, callback);
        }
      });
    },


    cancelDownload: function() {
      var backButtonRoute = "#/editor/" + this.currentCourseId + "/menu";
      Origin.router.navigateTo(backButtonRoute);
    },

    // needs to post form to new end point
    downloadProject: function() {
      if(Origin.editor.isDownloadPending) {
        return;
      }
      $('.editor-common-sidebar-download-inner').addClass('display-none');
      $('.editor-common-sidebar-downloading').removeClass('display-none');

      var url = 'api/output/' + Origin.constants.outputPlugin + '/publish/' + this.currentCourseId;
      $.get(url, function(data, textStatus, jqXHR) {
        if (!data.success) {
          Origin.Notify.alert({
            type: 'error',
            text: Origin.l10n.t('app.errorgeneric') +
              Origin.l10n.t('app.debuginfo', { message: jqXHR.responseJSON.message })
          });
          this.resetDownloadProgress();
          return;
        }
        const pollUrl = data.payload && data.payload.pollUrl;
        if (pollUrl) {
          // Ping the remote URL to check if the job has been completed
          this.updateDownloadProgress(pollUrl);
          return;
        }
        this.resetDownloadProgress();
        console.log(JSON.stringify(data.payload));
        var $downloadForm = $('#downloadForm');
        $downloadForm.attr('action', 'download/' + Origin.sessionModel.get('tenantId') + '/' + this.currentCourseId + '/' + data.payload.zipName + '/download.zip');
        $downloadForm.submit();

      }.bind(this)).fail(function(jqXHR, textStatus, errorThrown) {
        this.resetDownloadProgress();
        Origin.Notify.alert({ type: 'error', text: Origin.l10n.t('app.errorgeneric') });
      }.bind(this));
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

    resetDownloadProgress: function() {
      $('.editor-common-sidebar-download-inner').removeClass('display-none');
      $('.editor-common-sidebar-downloading').addClass('display-none');
      Origin.editor.isDownloadPending = false;
    }
  }, {
    template: 'publishOptions'
  });

  return PublishOptionsView;
});

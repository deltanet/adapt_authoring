// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var ConfigModel = require('core/models/configModel');
  var PublishOptionsPluginView = require('./publishOptionsPluginView');

  var extensionSchemas;
  var enabledTrackingPlugin;

//use this.model.get() /set()

  var PublishOptionsView = OriginView.extend({
    tagName: 'div',
    className: 'publishOptions',
    createdCourseId: false,

    preRender: function() {
      this.currentCourseId = Origin.location.route1;  // TODO - this should be got from data returned from ajax call to publishoptions end point. Which should also return validation data.
      Origin.trigger('location:title:update', { title: Origin.l10n.t('app.download') });
      this.listenTo(Origin, { 'editorCommon:download': this.downloadProject });
      this.listenTo(Origin, { 'publishOptions:cancel': this.cancelDownload });
      this.listenTo(Origin, { 'publishOptions:checkErrors': this.displayErrors });
      this.getConfig(function(data) {
        var configData = data.toJSON();
        this.displaySummary(configData);
        this.displayOptions(configData);
        this.displayErrors(configData);
      }.bind(this));
    },

    postRender: function() {
      this.setViewToReady();
    },

    displaySummary: function(data) {
      var enabledExtensions = data.enabledExtensions
      var $summaryList = this.$('#summary-list');
      if (enabledExtensions.length > 0) {
        $summaryList.find('.publish-summary-none').toggleClass('display-none');
      }
      enabledExtensions.forEach(function(model) {
        model.pluginEnabled = true;
        $summaryList.append(new PublishOptionsPluginView({ data: model }).$el);
      });
    },

    displayOptions: function(data) {
      var availableExtensions = data.availableExtensions
      var $optionsList = this.$('#options-list');
      if (availableExtensions.length > 0) {
        $optionsList.find('.publish-options-none').toggleClass('display-none');
      }
      availableExtensions.forEach(function(model) {
        model.pluginEnabled = false;
        $optionsList.append(new PublishOptionsPluginView({ data: model }).$el);
      });
    },

    displayErrors: function() {

    },

    setupExtensions: function(configData, callback) {
      var _this = this;
      var extensionModel = configData.toJSON();
      var enabledExtensions = extensionModel._enabledExtensions;
      var enabledExtensionNames = _.pluck(enabledExtensions, 'name');
      var trackingExtensionNames = ['adapt-contrib-xapi', 'adapt-contrib-spoor'];
      var enabledExtensions = [];
      var disabledExtensions = [];
      var allExtensions = Origin.editor.data.extensiontypes;

      allExtensions.each(function(model) {
        var extension = model.toJSON();

        // only add tracking extensions
        if (_.indexOf(trackingExtensionNames, extension.name) > -1) {
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
        return callback(_this.model);
      }
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

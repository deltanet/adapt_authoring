// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Backbone = require('backbone');
  var Origin = require('core/origin');
  var OriginView = require('core/views/originView');
  var ConfigModel = require('core/models/configModel');
  var PublishOptionsPluginView = require('./publishOptionsPluginView');
  var PublishConfigEditView = require('./publishConfigEditView');

  // hard coded array of tracking oldPluginsRemoved
  var trackingExtensionNames = ['adapt-contrib-xapi', 'adapt-contrib-spoor'];
  var enabledExtensions;
  // store of available and enabled extension schemas
  var enabledSchemas = [];
  var availableSchemas = [];

  var configModel = {}; // TODO - this has changed to this.model
  var publishPluginJson = {}; // store of changes to configuration data including extensions, this will get sent to publish end point
  var publishPluginTarget;

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
      this.listenTo(Origin, { 'publishOptions:togglePlugin': this.togglePlugin });
      this.listenTo(Origin, { 'publishOptions:editPlugin': this.editPlugin });
      this.listenTo(Origin, { 'publishConfigEditSidebar:views:cancel': this.toggleModalOverlay });

      this.setupExtensionSchemas();
      this.setupPublishJson();
    },

    postRender: function() {
      this.populateForm();
      this.displaySummary();
      this.displayOptions();
      this.setViewToReady();
    },

    displaySummary: function() {
      var $summaryList = this.$('#summary-list');
      if (enabledSchemas.length > 0) {
        $summaryList.find('.publish-summary-none').toggleClass('display-none');
      }
      enabledSchemas.forEach(function(model) {
        model.pluginEnabled = true;
        $summaryList.append(new PublishOptionsPluginView({ data: model }).$el);
      });
    },

    displayOptions: function() {
      var $optionsList = this.$('#options-list');
      if (availableSchemas.length > 0) {
        console.log('More than one availableSchemas');
        $optionsList.find('.publish-options-none').toggleClass('display-none');
      }
      availableSchemas.forEach(function(model) {
        model.pluginEnabled = false;
        $optionsList.append(new PublishOptionsPluginView({ data: model }).$el);
      });
    },

    setupExtensionSchemas: function(callback) {
      enabledExtensions = this.model.get('_enabledExtensions');
      var enabledExtensionNames = _.pluck(enabledExtensions, 'name');
      var allExtensions = Origin.editor.data.extensiontypes;

      allExtensions.each(function(extension) {
        var extension = extension.toJSON();

        // only add tracking extensions
        if (_.indexOf(trackingExtensionNames, extension.name) > -1) {
          if (_.indexOf(enabledExtensionNames, extension.name) > -1) {
            enabledSchemas.push(extension);
          } else if (extension._isAvailableInEditor) {
            availableSchemas.push(extension);
          }
        }
      });
    },

    // Do intial population of publish settings, takes the first eligable enabled plugin or returns
    setupPublishJson: function() {
      if (enabledExtensions.length == 0) return;

      var initialPublishPlugin = enabledExtensions[Object.keys(enabledExtensions)[0]];
      var configExtensions = this.model.get('_extensions');
      publishPluginTarget = initialPublishPlugin.targetAttribute;
      publishPluginJson = configExtensions[publishPluginTarget]; // TODO - copy object rather than use reference.
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

      var url = 'api/output/' + Origin.constants.outputPlugin + '/publishOptions/' + this.currentCourseId;

      this.$('form.downloadCourse').ajaxSubmit({
        url: url,
        uploadProgress: function(event, position, total, percentComplete) {
          $(".progress-container").css("visibility", "visible");
          var percentVal = percentComplete + '%';
          $(".progress-bar").css("width", percentVal);
          $('.progress-percent').html(percentVal);
        },
        error: this.onAjaxError.bind(this),
        success: this.onDownloadSuccess.bind(this)
      });
    },

    onDownloadSuccess: function(data, textStatus, jqXHR) {
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
      var $downloadForm = $('#downloadForm');
      $downloadForm.attr('action', 'download/' + Origin.sessionModel.get('tenantId') + '/' + this.currentCourseId + '/' + data.payload.zipName + '/download.zip');
      $downloadForm.submit();
    },

    onAjaxError: function(data, status, error) {
      this.resetDownloadProgress();
      Origin.Notify.alert({ type: 'error', text: Origin.l10n.t('app.errorgeneric') });
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
    },

    populateForm: function() {
      $('input[name="trackingPluginJson"]').val(JSON.stringify(publishPluginJson));
    },


    /*
    * Takes a new plugin and opens an edit screen for config with the new extension populated instead of the old
    * save replaces old extension in config with newPlugin
    * save also swaps the publish settings/options views by setting the enabled extensions.
    * cancel does nothing
    */

    togglePlugin: function(newPlugin) {
      var newPluginJson = JSON.stringify(newPlugin);
      Origin.Notify.alert({ type: 'info', text: Origin.l10n.t('app.publishPluginWarning', { plugin: newPlugin.name }) });
      // remove the plugin views
      Origin.trigger('publishOptions:pluginView:remove');

      var oldPluginsRemoved = this.removeEnabledPlugin();

      if (!oldPluginsRemoved) {
        console.log('Error removing old plugin');
        // TODO - create alert here
      }
      var replacementExtension = {
        _id: newPlugin._id,
        name: newPlugin.name,
        version: newPlugin.version,
        targetAttribute: newPlugin.targetAttribute
      }
      var configEnabledExtensions = configModel.get('_enabledExtensions');
      var configExtensions = configModel.get('_extensions');

      configEnabledExtensions[newPlugin.extension] = replacementExtension;

    },

    removeEnabledPlugin: function() {
      if (enabledExtensions.length >= 1) {
        var enabledExtension = enabledExtensions[0];
        var oldExtension =  enabledExtension.extension;
        var oldTargetAttribute = enabledExtension.targetAttribute;
        var configEnabledExtensions = configModel.get('_enabledExtensions');
        var configExtensions = configModel.get('_extensions');

        delete configExtensions[oldTargetAttribute];
        delete configEnabledExtensions[oldExtension];

        configModel.set('_enabledExtensions', configEnabledExtensions);
        configModel.set('_extensions', configExtensions);
        return true;
      }
    },

    editPlugin: function(plugin) {
      // TODO - form is not being populated with actual data from config for this course.
      this.toggleModalOverlay(true);
      console.log(publishPluginJson);
      var form = Origin.scaffold.buildForm({ model: new Backbone.Model(publishPluginJson) });
      var configView = new PublishConfigEditView({ model: publishPluginJson, form: form });
      $('body').append(configView.$el);
    },

    toggleModalOverlay: function(modalActive) {
      var isModalActive = modalActive ? modalActive : false
      if (isModalActive === true) {
        $('body').append(Handlebars.templates.configModalOverlay);
      } else {
        $('.config-modal-overlay').remove();
      }
    },

  }, {
    template: 'publishOptions'
  });

  return PublishOptionsView;
});

// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Backbone = require('backbone');
  var EditorOriginView = require('editorGlobal/views/editorOriginView');
  var Handlebars = require('handlebars');
  var Origin = require('coreJS/app/origin');
  var PresetCollection = require('../collections/editorPresetCollection');
  var PresetEditView = require('./editorPresetEditView');
  var PresetModel = require('../models/editorPresetModel');
  var ThemeCollection = require('editorTheme/collections/editorThemeCollection');

  var ThemingView = EditorOriginView.extend({
    tagName: 'div',
    className: 'theming',

    settings: {
      autoRender: false
    },

    events: {
      'change .theme select': 'onThemeChanged',
      'change .preset select': 'onPresetChanged',
      'click button.edit': 'showPresetEdit',
      'click button.reset': 'restoreDefaultSettings'
    },

    initialize: function() {
      Origin.trigger('location:title:update', { title: window.polyglot.t('app.themingtitle') });

      this.listenTo(this, 'dataReady', this.render);
      this.listenTo(Origin, 'editorThemingSidebar:views:save', this.saveData);
      this.listenTo(Origin, 'editorThemingSidebar:views:savePreset', this.onSavePresetClicked);

      this.listenTo(Origin, 'managePresets:edit', this.onEditPreset);
      this.listenTo(Origin, 'managePresets:delete', this.onDeletePreset);

      this.loadCollections();

      EditorOriginView.prototype.initialize.apply(this, arguments);
    },

    render: function() {
      // set the selected theme/preset
      this.themes.findWhere({ name: this.model.get('_theme') }).set('_isSelected', true);
      var preset = this.presets.findWhere({ _id: this.model.get('_themepreset') });
      preset && preset.set('_isSelected', true);

      EditorOriginView.prototype.render.apply(this, arguments);
      this.renderForm();
    },

    renderForm: function() {
      // out with the old
      this.$('.form-container').empty();

      var selectedTheme = this.getSelectedTheme();
      var themeHasProperties = selectedTheme.get('properties') && Object.keys(selectedTheme.get('properties')).length > 0;
      if(selectedTheme && themeHasProperties) {
        this.form = Origin.scaffold.buildForm({
          model: selectedTheme,
          schemaType: selectedTheme.get('theme')
        });

        var toRestore = Origin.editor.data.course.get('themeSettings') || this.getDefaultThemeSettings();
        this.restoreFormSettings(toRestore);

        this.$('.form-container').html(this.form.el);
        this.$('.theme-customiser').show();
        this.$('button.edit').show();
        Origin.trigger('theming:showPresetButton', true);
      }
      else {
        this.$('.theme-customiser').hide();
        this.$('button.edit').hide();
        Origin.trigger('theming:showPresetButton', false);
      }
    },

    postRender: function() {
      this.updateThemeSelect();
      this.updatePresetSelect();
      this.setViewToReady();
    },

    remove: function() {
      if(this.form) {
        // HACK to clean up undefined colorpickers
        // This removes ALL colorpicker instances........
        $('.colorpicker').remove();
      }
      EditorOriginView.prototype.remove.apply(this, arguments);
    },

    loadCollections: function() {
      this.themes = new ThemeCollection();
      this.listenTo(this.themes, 'sync', this.onCollectionReady);
      this.listenTo(this.themes, 'error', this.onError);
      this.themes.fetch();

      this.presets = new PresetCollection();
      this.listenTo(this.presets, 'sync', this.onCollectionReady);
      this.listenTo(this.presets, 'error', this.onError);
      this.presets.fetch();
    },

    updateThemeSelect: function() {
      var select = this.$('.theme select');
      // remove options first
      $('option', select).remove();
      // add 'no presets'
      select.append($('<option>', { value: "", disabled: 'disabled', selected: 'selected' }).text(window.polyglot.t('app.selectinstr')));
      // add options
      _.each(this.themes.models, function(item, index) {
        select.append($('<option>', { value: item.get('_id') }).text(item.get('displayName')));
      }, this);

      // disable if no options
      select.attr('disabled', this.themes.models.length === 0);

      // select current theme
      var selectedTheme = this.getSelectedTheme();
      if(selectedTheme) {
        select.val(selectedTheme.get('_id'));
      }
    },

    updatePresetSelect: function() {
      console.log('updatePresetSelect');
      var theme = $('.theme select').val();
      var presets = this.presets.where({ parentTheme: theme });
      var select = this.$('.preset select');
      // remove options first
      $('option', select).remove();
      // add 'no presets'
      select.append($('<option>', { value: "", selected: 'selected' }).text(window.polyglot.t('app.nopresets')));
      // add options
      _.each(presets, function(item, index) {
        select.append($('<option>', { value: item.get('_id') }).text(item.get('displayName')));
      }, this);
      // disable delect, hide manage preset buttons if empty
      if(presets.length > 0) {
        // TODO check selected preset exists in db (in case deleted)
        var selectedPreset = this.getSelectedPreset();
        if(selectedPreset && selectedPreset.get('parentTheme') === theme) {
          select.val(selectedPreset.get('_id'));
        }
        select.attr('disabled', false);
        this.$('button.edit').show();
        this.$('button.reset').show();
      } else {
        select.attr('disabled', true);
        this.$('button.edit').hide();
        this.$('button.reset').hide();
      }
    },

    restoreFormSettings: function(toRestore) {
      if(!this.form || !this.form.el) return console.log('No form to restore...');

      for(var key in toRestore) {
        var el = $('[name=' + key + ']', this.form.el);
        el.val(toRestore[key]);
        if(el.hasClass('scaffold-color-picker')) {
          el.css('background-color', toRestore[key]);
        }
      }
    },

    // checks form for errors, returns true if valid, false otherwise
    validateForm: function() {
      var selectedTheme = this.getSelectedTheme();
      var selectedPreset = this.getSelectedPreset();

      if (selectedTheme === undefined) {
        Origin.Notify.alert({
          type: 'error',
          text: window.polyglot.t('app.errornothemeselected')
        });
        return false;
      }
      return true;
    },

    saveData: function(event) {
      event && event.preventDefault();

      if(!this.validateForm()) {
        return Origin.trigger('sidebar:resetButtons');
      }

      this.postThemeData(function(){
        this.postPresetData(function() {
          this.postSettingsData(this.onSaveSuccess);
        });
      });
    },

    postThemeData: function(callback) {
      var selectedTheme = this.getSelectedTheme();
      var selectedThemeId = selectedTheme.get('_id');
      $.post('/api/theme/' + selectedThemeId + '/makeitso/' + this.model.get('_courseId'))
        .error(_.bind(this.onSaveError, this))
        .done(_.bind(callback, this));
    },

    postPresetData: function(callback) {
      var selectedPreset = this.getSelectedPreset();
      if(selectedPreset) {
        var selectedPresetId = selectedPreset.get('_id');
        $.post('/api/themepreset/' + selectedPresetId + '/makeitso/' + this.model.get('_courseId'))
        .error(_.bind(this.onSaveError, this))
        .done(_.bind(callback, this));
      } else {
        callback.apply(this);
      }
    },

    postSettingsData: function(callback) {
      var selectedTheme = this.getSelectedTheme();
      if(this.form) {
        this.form.commit();
        console.log(this.getSelectedTheme(), this.getSelectedPreset());
        var settings = _.pick(selectedTheme.attributes, Object.keys(selectedTheme.get('properties')));
        Origin.editor.data.course.set('themeSettings', settings);
        Origin.editor.data.course.save(null, {
          error: _.bind(this.onSaveError, this),
          success: _.bind(callback, this)
        });
      } else {
        callback.apply(this);
      }
    },

    savePreset: function(presetName) {
      // first, save the form data
      this.form.commit();

      var presetModel = new PresetModel({
        displayName: presetName,
        parentTheme: this.getSelectedTheme().get('_id'),
        properties: _.pick(this.form.model.attributes, Object.keys(this.form.model.get('properties')))
      });
      presetModel.save();
      this.presets.add(presetModel);
    },

    navigateBack: function(event) {
      event && event.preventDefault();
      Backbone.history.history.back();
      this.remove();
    },

    isDataLoaded: function() {
      return this.themes.ready === true && this.presets.ready === true;
    },

    getSelectedTheme: function() {
      return this.themes.findWhere({ '_isSelected': true });
    },

    getSelectedPreset: function() {
      return this.presets.findWhere({ '_isSelected': true });
    },

    getDefaultThemeSettings: function() {
      var defaults = {};
      var props = this.getSelectedTheme().get('properties');
      for (var key in props) {
        if (props.hasOwnProperty(key)) {
          defaults[key] = props[key].default;
        }
      }
      return defaults;
    },

    /**
    * Event handling
    */

    showPresetEdit: function(event) {
      event && event.preventDefault();
      var parentTheme = this.getSelectedTheme().get('_id');
      var pev = new PresetEditView({
        model: new Backbone.Model({ presets: new Backbone.Collection(this.presets.where({ parentTheme: parentTheme })) })
      });
      $('body').append(pev.el);
    },

    restoreDefaultSettings: function(event) {
      event && event.preventDefault();
      var self = this;
      Origin.Notify.confirm({
        type: 'warning',
        text: window.polyglot.t('app.restoredefaultstext'),
        callback: function(confirmed) {
          if(confirmed) {
            var preset = self.getSelectedPreset();
            console.log(preset);
            var settings = (preset) ? preset.get('properties') : self.getDefaultThemeSettings();
            self.restoreFormSettings(settings);
          }
        }
      });
    },

    onEditPreset: function(data) {
      var model = this.presets.findWhere({ displayName: data.oldValue });
      console.log(model.set('displayName', data.newValue));
      model.save();
    },

    onDeletePreset: function(preset) {
      this.presets.findWhere({ displayName: preset }).destroy();
    },

    onCollectionReady: function(collection) {
      if(collection === this.themes) this.themes.ready = true;
      else if(collection === this.presets) this.presets.ready = true;

      if(this.isDataLoaded()) this.trigger('dataReady');
    },

    onError: function(collection, response, options) {
      Origin.Notify.alert({
        type: 'error',
        text: response
      });
    },

    onThemeChanged: function(event) {
      // unset old
      this.themes.findWhere({ _isSelected: true }).set("_isSelected", false);
      // set new
      var themeId = this.$('.theme select').val();
      this.themes.findWhere({ _id: themeId }).set("_isSelected", true);

      this.updatePresetSelect();
      this.renderForm();
    },

    onPresetChanged: function(event) {
      // unset old
      this.presets.findWhere({ _isSelected: true }).set("_isSelected", false);
      // set _isSelected
      var presetId = $(event.currentTarget).val();
      var preset = this.presets.findWhere({ _id: presetId });
      if(preset) {
        preset.set("_isSelected", true);
        this.restoreFormSettings(preset.attributes);
      }
    },

    onSavePresetClicked: function() {
      var self = this;
      var selectedPreset = this.getSelectedPreset();
      if(selectedPreset) {
        Origin.Notify.confirm({
          text: window.polyglot.t('app.themeoverwrite', { preset: selectedPreset.displayName }),
          callback: function() {
            if(arguments[0] === true) self.savePreset(selectedPreset.displayName);
          }
        });
      } else {
        Origin.Notify.alert({
          type: 'input',
          text: window.polyglot.t('app.presetinputtext'),
          showCancelButton: true,
          callback: function() {
            self.savePreset(arguments[0]);
          }
        });
      }
    },

    onSaveError: function() {
      Origin.Notify.alert({
        type: 'error',
        text: window.polyglot.t('app.errorsave')
      });
      this.navigateBack();
    },

    onSaveSuccess: function() {
      Origin.trigger('editingOverlay:views:hide');
      Origin.trigger('editor:refreshData', this.navigateBack, this);
    }
  }, {
    template: 'editorTheming'
  });

  return ThemingView;
});

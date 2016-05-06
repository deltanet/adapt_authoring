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
      'click a.edit': 'showPresetEdit'
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
      // set the selected theme flag
      this.themes.findWhere({ name: this.model.get('_theme') }).set('_isSelected', true);

      EditorOriginView.prototype.render.apply(this, arguments);
      this.renderForm();
    },

    renderForm: function() {
      console.log('renderForm');
      // out with the old
      this.$('.form-container').empty();

      var selectedTheme = this.getSelectedTheme();
      var themeHasProperties = selectedTheme.get('properties') && Object.keys(selectedTheme.get('properties')).length > 0;
      if(selectedTheme && themeHasProperties) {
        this.form = Origin.scaffold.buildForm({
          model: selectedTheme,
          schemaType: selectedTheme.get('theme')
        });

        this.$('.form-container').html(this.form.el);
        this.$('.theme-customiser').show();
      } else {
        this.$('.theme-customiser').hide();
      }
    },

    postRender: function() {
      this.updateThemeSelect();
      this.updatePresetSelect();
      this.setViewToReady();
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
      var themeSelect = this.$('.theme select');
      this.updateSelect(themeSelect, this.themes.models);

      // select current theme
      var selectedTheme = this.getSelectedTheme();
      if(selectedTheme) {
        themeSelect.val(selectedTheme.get('_id'));
      }
    },

    updatePresetSelect: function() {
      var selectedThemeId = $('.theme select').val();
      var presets = this.presets.where({ parentTheme: selectedThemeId });
      var presetSelect = this.$('.preset select');

      this.updateSelect(presetSelect, presets);
      // TODO check selected preset exists (show error message), and select it
    },

    // adds all installed optionsCollection items as options to select
    // can also be used to disable the select (if no options passed)
    updateSelect: function(select, options) {
      // remove previous options
      $('option', select).remove();
      // add generic instruction
      select.append($('<option>', { disabled: 'disabled', selected: 'selected' }).text(window.polyglot.t('app.selectinstr')));
      // add options
      _.each(options, function(item, index) {
        select.append($('<option>', { value: item.get('_id') }).text(item.get('displayName')));
      }, this);
      // disable if no options
      select.attr('disabled', options.length === 0);
    },

    saveData: function(event) {
      event && event.preventDefault();

      // TODO validation
      // TODO store variable data

      var selectedTheme = this.getSelectedTheme();
      var selectedPreset = this.getSelectedPreset();

      // TODO remove
      console.log('Apply', selectedTheme && selectedTheme.get('displayName') || 'NO THEME?!', selectedPreset && selectedPreset.get('displayName') || 'no preset');

      if (selectedTheme === undefined) {
        Origin.Notify.alert({
          type: 'error',
          text: window.polyglot.t('app.errornothemeselected')
        });
        Origin.trigger('sidebar:resetButtons');
        return;
      }

      // inform the backend

      var selectedThemeId = selectedTheme.get('_id');
      $.post('/api/theme/' + selectedThemeId + '/makeitso/' + this.model.get('_courseId'))
        .error(_.bind(this.onSaveError, this))
        .done(_.bind(this.onSaveSuccess, this));

      if(selectedPreset) {
        // TODO apply preset
        /*
        var selectedPresetId = selectedTheme.get('_id');
        $.post('/api/preset/' + selectedThemeId + '/makeitso/' + this.model.get('_courseId'))
        .error(_.bind(this.onSaveError, this))
        .done(_.bind(this.onSaveSuccess, this));
        */
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

    /**
    * Event handling
    */

    showPresetEdit: function(event) {
      event && event.preventDefault();
      var pev = new PresetEditView({
        model: new Backbone.Model({ presets: this.presets })
      });
      $('body').append(pev.el);
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
      // set _isSelected
      var presetId = $(event.currentTarget).val();
      this.presets.findWhere({ _id: presetId }).set("_isSelected", true);
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

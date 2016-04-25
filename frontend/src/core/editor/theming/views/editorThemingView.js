// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require){
  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var Origin = require('coreJS/app/origin');
  var OriginView = require('coreJS/app/views/originView');
  var ThemeCollection = require('editorTheme/collections/editorThemeCollection');
  var PresetCollection = require('../collections/editorPresetCollection');

  var ThemingView = OriginView.extend({
    tagName: 'div',
    className: 'theming',

    events: {
      'change .theme select': 'onThemeChanged',
      'change .preset select': 'onPresetChanged'
    },

    /**
    * Overrides
    */

    preRender: function() {
      Origin.trigger('location:title:update', { title: window.polyglot.t('app.setstyle') });

      this.loadCollections();

      this.listenTo(Origin, 'editorThemingSidebar:views:save', this.saveData);
    },

    postRender: function() {
      // wait for dataReady
      if(!this.isDataLoaded()) {
        return this.listenTo(this, 'dataReady', this.postRender);
      }
      // TODO select selected theme
      this.updateThemeSelect();
      this.updatePresetSelect();
      this.setViewToReady();
    },

    /**
    * Main funcs
    */

    loadCollections: function() {
      this.themes = new ThemeCollection();
      this.listenTo(this.themes, 'sync', this.onCollectionReady);
      this.themes.fetch();

      this.presets = new PresetCollection();
      this.listenTo(this.presets, 'sync', this.onCollectionReady);
      this.presets.fetch();
    },

    updateThemeSelect: function() {
      var themeSelect = this.$('.theme select');
      this.updateSelect(themeSelect, this.themes.models);

      // select current theme
      var selectedTheme = this.themes.findWhere({ name: this.model.get('_theme') });
      themeSelect.val(selectedTheme.get('_id'));
    },

    updatePresetSelect: function() {
      var selectedThemeId = $('.theme select').val();
      var presets = this.presets.where({ parentTheme: selectedThemeId });
      if(presets.length > 0) {
        var presetSelect = this.$('.preset select');
        this.updateSelect(presetSelect, presets);
      }
    },

    // adds all installed optionsCollection items as options to select
    updateSelect: function(select, options) {
      _.each(options, function(item, index) {
        select.append($('<option>', { value : item.get('_id') }).text(item.get('displayName')));
      }, this);
      select.attr('disabled', false);
    },

    saveData: function(event) {
      event && event.preventDefault();

      // TODO validation
      // TODO store variable data

      var selectedTheme = this.themes.findWhere({_isSelected: true});
      var selectedPreset = this.presets.findWhere({_isSelected: true});

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
        var selectedPresetId = selectedTheme.get('_id');
        $.post('/api/preset/' + selectedThemeId + '/makeitso/' + this.model.get('_courseId'))
        .error(_.bind(this.onSaveError, this))
        .done(_.bind(this.onSaveSuccess, this));
      }
    },

    navigateBack: function(event) {
      event && event.preventDefault();
      Backbone.history.history.back();
      this.remove();
    },

    isDataLoaded: function() {
      return this.themes.ready === true && this.presets.ready === true;
    },

    /**
    * Event handling
    */

    onCollectionReady: function(collection) {
      if(collection === this.themes) this.themes.ready = true;
      else if(collection === this.presets) this.presets.ready = true;

      if(this.isDataLoaded()) this.trigger('dataReady');
    },

    onThemeChanged: function(event) {
      var themeId = this.$('.theme select').val();
      var theme = this.themes.findWhere({ _id: themeId });
      theme.set("_isSelected", true);
      this.updatePresetSelect();
    },

    onPresetChanged: function(event) {
      var presetId = $(event.currentTarget).val();
      var preset = this.presets.findWhere({ _id: presetId });
      preset.set("_isSelected", true);
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

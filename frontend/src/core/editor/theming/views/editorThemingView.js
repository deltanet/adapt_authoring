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
      if(this.isDataLoaded()) {
        this.addThemeSelect();
        this.addPresetSelect();
        this.setViewToReady();
      } else {
        this.listenTo(this, 'dataReady', this.postRender);
      }
    },

    /**
    * Main funcs
    */

    loadCollections: function() {
      this.themes = new ThemeCollection();
      this.listenTo(this.themes, 'sync', this.onCollectionReady);
      this.themes.fetch();

      this.presets = {
        length: 0
      }

      /*
      this.presets = new PresetCollection();
      this.listenTo(this.presets, 'sync', this.onCollectionReady);
      this.presets.fetch();
      */
    },

    // adds all installed themes as <options> to theme <select>
    addThemeSelect: function() {
      var themeSelect = $('.theme select', this.$el);

      this.themes.each(function(theme, index) {
        themeSelect.append($('<option>', { value : theme.get('_id') }).text(theme.get('displayName')));
      }, this);

      themeSelect.attr('disabled', false);
    },

    // adds all saved presets as <options> to preset <select>
    addPresetSelect: function() {
      var presets = [];

      if(presets.length === 0) return;

      var presetSelect = $('.preset select', this.$el);

      this.presets.each(function(preset, index) {
        presetSelect.append($('<option>', { value : preset.get('_id') }).text(preset.get('displayName')));
      }, this);

      presetSelect.attr('disabled', false);
    },

    saveData: function(event) {
      event && event.preventDefault();
      console.log('saveData');
      console.log(this.themes);

      // TODO store variable data

      var selectedTheme = this.themes.findWhere({_isSelected: true});

      // TODO validation

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
    },

    navigateBack: function(event) {
      event && event.preventDefault();
      Backbone.history.history.back();
      this.remove();
    },

    isDataLoaded: function() {
      return this.themes.ready === true;
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
      var theme = this.themes.findWhere({ _id: $(event.currentTarget).val() });
      console.log(theme.set("_isSelected", true));
    },

    onPresetChanged: function(event) {
      console.log('onPresetChanged', event);
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

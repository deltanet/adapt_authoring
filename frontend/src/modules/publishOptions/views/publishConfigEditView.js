// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Origin = require('core/origin');
  var EditorOriginView = require('../../editor/global/views/editorOriginView');

  var PublishConfigEditView = EditorOriginView.extend({
    className: "publish-config-edit",
    tagName: "div",

    events: {
      'click .paste-cancel': 'onPasteCancel',
      'click .field-object .legend': 'onFieldObjectClicked',
      'dblclick .editor-item-settings-inner > button': 'onDbClick',
      'click .publish-config-edit-sidebar-save': 'saveEditing',
      'click .publish-config-edit-sidebar-cancel': 'cancelEditing'
    },

    saveEditing: function(event) {
      event && event.preventDefault();
      this.updateButton('.publish-config-edit-sidebar-save', Origin.l10n.t('app.saving'));
      Origin.trigger('publishConfigEditSidebar:views:save');
    },

    cancelEditing: function(event) {
      event && event.preventDefault();
      Origin.trigger('publishConfigEditSidebar:views:cancel');
      this.remove();
    },

    preRender: function() {
      this.listenTo(Origin, {
        'editorSidebarView:removeEditView': this.remove,
        'publishConfigEditSidebar:views:save': this.updateTempConfig,
      });
    },

    getAttributesToSave: function() {
      var changed = this.model.changedAttributes();
      if(!changed) {
        return null;
      }
      return _.extend(changed, {
        _id: this.model.get('_id'),
        _courseId: this.model.get('_courseId')
      });
    },

    updateTempConfig: function() {
      console.log('updateTempConfig function called');
    }
  }, {
    template: 'publishConfigEdit'
  });

  return PublishConfigEditView;
});

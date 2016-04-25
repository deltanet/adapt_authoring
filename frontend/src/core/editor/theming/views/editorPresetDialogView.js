// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
    var OriginView = require('coreJS/app/views/originView');

    var EditorPresetDialogView = OriginView.extend({
        className: 'preset-dialog',

        events: {
            'click .preset-toolbar-save': 'onSaveButtonClicked',
            'click .preset-toolbar-close': 'onCloseButtonClicked',
        },

        render: function() {
            var template = Handlebars.templates[this.constructor.template];
            this.$el.html(template());
            _.defer(_.bind(function() {
                this.postRender();
            }, this));
            return this;
        },

        postRender: function() {
            /*
            // Position sidebar filter to filter button
            var offsetTop = $('.sidebar-filter-button').offset().top;
            this.$el.css({'top': offsetTop, 'display': 'block'});
            // Bring focus to the filter input field
            this.$('.sidebar-filter-search-input').focus();
            // First item should be selected so the user can press enter
            this.$('.sidebar-filter-item').first().addClass('selected');
            */
        },

        onSaveButtonClicked: function() {
            console.log('save');
        },

        onCloseButtonClicked: function() {
            this.remove();
        }
    }, {
        template: 'editorPresetDialog'
    });

    return EditorPresetDialogView;
})

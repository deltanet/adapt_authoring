// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Backbone = require('backbone');

  var PresetCollection = Backbone.Collection.extend({
    url: 'api/content/themepreset',
    comparator: 'parentTheme'
  });

  return PresetCollection;
});

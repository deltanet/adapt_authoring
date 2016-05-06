// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
var ContentPlugin = require('../../../lib/contentmanager').ContentPlugin;
var permissions = require('../../../lib/permissions');
var util = require('util');

function ThemePresetContent () {
}
util.inherits(ThemePresetContent, ContentPlugin);

ThemePresetContent.prototype.hasPermission = function (action, userId, tenantId, contentItem, next) {
  return next(null, true);
};

ThemePresetContent.prototype.getModelName = function () {
  return 'themepreset';
};

// Module exports
exports = module.exports = ThemePresetContent;

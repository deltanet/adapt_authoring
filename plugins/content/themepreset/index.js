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

ThemePresetContent.prototype.create = function (data, next) {
  ContentPlugin.prototype.create.call(this, data, next);
};

function initialize () {
  app.on('serverStarted', function () {
    permissions.ignoreRoute(/^\/api\/themepreset\/?.*$/);
    // routes
    app.rest.post('/themepreset', createPreset);
    app.rest.delete('/themepreset', deletePreset);
  });
};

function createPreset(req, res, next) {
  // TODO check permissions
  app.contentmanager.getContentPlugin('themepreset', function(error, plugin) {
    if(error) return sendResponse(error, res);
    // TODO validation here (no themes with same display name & parent theme, same preset values)
    // TODO support updates?
    plugin.create(req.body, function(error, results) {
      if(error) return sendResponse(error, res);
      console.log('Preset created!', results);
      sendResponse(null, res);
    });
  });
};

function deletePreset(req, res, next) {
  // TODO check permissions
  console.log('Delete preset', req.body);
};

function sendResponse(error, res) {
  if(error) return res.status(500).send(error);
  else res.status(200).send('Preset created successfully');
};

initialize();

// Module exports
exports = module.exports = ThemePresetContent;

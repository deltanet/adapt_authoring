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
    app.rest.get('/themepreset/test', test);
    app.rest.post('/themepreset', createPreset);
    app.rest.delete('/themepreset', deletePreset);
  });
};

function test(req, res, next) {
  console.log('Preset test');
  app.contentmanager.getContentPlugin('themepreset', function(error, plugin) {
    if(error) return console.log(error);
    plugin.create({
      displayName: 'Preset 1',
      parentTheme: '571789b4aace62088fe931ca',
      properties: {
        fontColour: '#000000',
        fontInvertedColour: '#333333'
      }
    }, function(error, results) {
      if(error) return console.log(error);
      console.log('Preset created!', results);
    });
  });
};

function createPreset(req, res, next) {
  console.log('Create preset', req.body);
};

function deletePreset(req, res, next) {
  console.log('Delete preset', req.body);
};

initialize();

// Module exports
exports = module.exports = ThemePresetContent;

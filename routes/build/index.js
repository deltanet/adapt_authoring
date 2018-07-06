var express = require('express');
var logger = require('../../lib/logger');
var server = module.exports = express();
var usermanager = require('../../lib/usermanager');
var configuration = require('../../lib/configuration');
var Constants = require('../../lib/outputmanager').Constants;
var configuration = require('../../lib/configuration');
var fs = require('fs');
var path = require('path');
var OutputPlugin = require('../../lib/outputmanager').OutputPlugin;
var util = require('util');

function DownloadOutput() {
}

util.inherits(DownloadOutput, OutputPlugin);

server.get('/build/:tenant/:course', function(req, res, next) {
  var course = req.params.course;
  var tenantId = req.params.tenant;
  var currentUser = usermanager.getCurrentUser();
  var mode = Constants.Modes.Build;

  if (currentUser) {

    var outputplugin = app.outputmanager.getOutputPlugin(configuration.getConfig('outputPlugin'), function (error, plugin){

      if (error) {
        logger.log('error', error);
        res.json({ success: false, message: error.message });
        return res.end();
      } else {
        plugin.publish(tenantId, course, mode, req, res, function (error, result) {
          if (error) {
            logger.log('error', 'Unable to publish');
            return res.json({ success: false, message: error.message });
          }
          res.statusCode = 200;
          return res.json(result);
        });
      }

    });
  } else {
    // User doesn't have access to this course
    res.statusCode = 401;
    return res.json({success: false});
  }
});

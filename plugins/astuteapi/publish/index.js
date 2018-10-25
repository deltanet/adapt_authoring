// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/**
 * Adapt Output plugin
 */

var origin = require('../../../');
var OutputPlugin = require('../../../lib/outputmanager').OutputPlugin;
var Constants = require('../../../lib/outputmanager').Constants;
var configuration = require('../../../lib/configuration');
var util = require('util');
var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var archiver = require('archiver');
var _ = require('underscore');
var usermanager = require('../../../lib/usermanager');
var exec = require('child_process').exec;
var semver = require('semver');
var helpers = require('../../../lib/helpers');
var installHelpers = require('../../../lib/installHelpers');
var logger = require('../../../lib/logger');
var rest = require('../../../lib/rest');
var tenantmanager = require('../../../lib/tenantmanager');
var database = require('../../../lib/database');
var assetmanager = require('../../../lib/assetmanager');
var filestorage = require('../../../lib/filestorage');


function AdaptTenantPublish() {
}

util.inherits(AdaptTenantPublish, OutputPlugin);

AdaptTenantPublish.prototype.getNewTenantName = function(tenantId, cb) {
  // get the tenant names
  tenantmanager.retrieveTenant({ _id: tenantId }, function (error, tenantRecs) {
    if (error) {
      logger.log('error', error);
      return cb(error);
    }

    if (!tenantRecs) {
      logger.log('error', "New tenant not found");
      return cb("New tenant not found");
    }
    var tenantNames = { newTenantName: tenantRecs.name };
    return cb(null, tenantNames);

  });
};

AdaptTenantPublish.prototype.publish = function(tenantId, courseId, mode, request, response, next) {
  var app = origin();

  var self = this;
  var user = usermanager.getCurrentUser();
  var courseTenantId = tenantId || user.tenant._id;
  var outputJson = {};
  var isRebuildRequired = true;
  var themeName = '';
  var menuName = Constants.Defaults.MenuName;
  var frameworkVersion;
  var newTenantName;

  var resultObject = {};

  // shorthand directories
  var FRAMEWORK_ROOT_FOLDER = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
  var SRC_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.Source);
  var COURSES_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.AllCourses);
  var COURSE_FOLDER = path.join(COURSES_FOLDER, courseTenantId, courseId);
  var BUILD_FOLDER = path.join(COURSE_FOLDER, Constants.Folders.Build);

  var customPluginName = user._id;

  async.series([
    // get an object with all the course data
    function(callback) {
      self.getCourseJSON(courseTenantId, courseId, function(err, data) {
        if (err) {
          return callback(err);
        }
        // Store off the retrieved collections
        outputJson = data;
        callback(null);
      });
    },
    //
    function(callback) {
      var temporaryThemeFolder = path.join(SRC_FOLDER, Constants.Folders.Theme, customPluginName);
      self.applyTheme(courseTenantId, courseId, outputJson, temporaryThemeFolder, function(err, appliedThemeName) {
        if (err) {
          return callback(err);
        }
        // Replace the theme in outputJson with the applied theme name.
        themeName = appliedThemeName;
        outputJson['config'][0]._theme = themeName;
        callback(null);
      });
    },
    function(callback) {
      self.sanitizeCourseJSON(mode, outputJson, function(err, data) {
        if (err) {
          return callback(err);
        }
        // Update the JSON object
        outputJson = data;
        callback(null);
      });
    },
    function(callback) {
      var temporaryThemeFolder = path.join(SRC_FOLDER, Constants.Folders.Theme, customPluginName);
      self.writeCustomStyle(courseTenantId, courseId, temporaryThemeFolder, function(err) {
        if (err) {
          return callback(err);
        }
        callback(null);
      });
    },
    function(callback) {
      self.getNewTenantName(courseTenantId, function(err, tenantNames) {
        if (err) {
          return callback(err);
        }
        newTenantName = tenantNames.newTenantName;
        callback(null);
      });
    },
    function(callback) {
      var temporaryMenuFolder = path.join(SRC_FOLDER, Constants.Folders.Menu, customPluginName);
      self.applyMenu(courseTenantId, courseId, outputJson, temporaryMenuFolder, function(err, appliedMenuName) {
        if (err) {
          return callback(err);
        }
        menuName = appliedMenuName;
        callback(null);
      });
    },
    function(callback) {
      var assetsJsonFolder = path.join(BUILD_FOLDER, Constants.Folders.Course, outputJson['config']._defaultLanguage);
      var assetsFolder = path.join(assetsJsonFolder, Constants.Folders.Assets);
      self.writeCourseAssets(newTenantName, courseTenantId, courseId, assetsJsonFolder, assetsFolder, outputJson, function(err, modifiedJson) {
        if (err) {
          return callback(err);
        }
        // Store the JSON with the new paths to assets
        outputJson = modifiedJson;
        callback(null);
      });
    },
    function(callback) {
      self.writeCourseJSON(outputJson, path.join(BUILD_FOLDER, Constants.Folders.Course), function(err) {
        if (err) {
          return callback(err);
        }
        callback(null);
      });
    },
    function(callback) {
      installHelpers.getInstalledFrameworkVersion(function(error, version) {
        frameworkVersion = version;
        callback(error);
      });
    },
    function(callback) {
      logger.log('info', '3.1. Ensuring framework build exists');

      var args = [];
      var outputFolder = COURSE_FOLDER.replace(FRAMEWORK_ROOT_FOLDER + path.sep,'');

      // Append the 'build' folder to later versions of the framework
      if (semver.gte(semver.clean(frameworkVersion), semver.clean('2.0.0'))) {
        outputFolder = path.join(outputFolder, Constants.Folders.Build);
      }

      args.push('--outputdir=' + outputFolder);
      args.push('--theme=' + themeName);
      args.push('--menu=' + menuName);

      logger.log('info', '3.2. Using theme: ' + themeName);
      logger.log('info', '3.3. Using menu: ' + menuName);

      var generateSourcemap = outputJson.config._generateSourcemap;
      var buildMode = generateSourcemap === true ? 'dev' : 'prod';

      logger.log('info', 'grunt server-build:' + buildMode + ' ' + args.join(' '));

      child = exec('grunt server-build:' + buildMode + ' ' + args.join(' '), {cwd: path.join(FRAMEWORK_ROOT_FOLDER)},
        function(error, stdout, stderr) {
          if (error !== null) {
            logger.log('error', 'exec error: ' + error);
            logger.log('error', 'stdout error: ' + stdout);
            resultObject.success = true;
            return callback(error, 'Error building framework');
          }

          if (stdout.length != 0) {
            resultObject.success = true;
            // Indicate that the course has built successfully
            app.emit('previewCreated', tenantId, courseId, outputFolder);

            return callback(null, 'Framework built OK');
          }

          if (stderr.length != 0) {
            logger.log('error', 'stderr: ' + stderr);
            resultObject.success = false;
            return callback(stderr, 'Error (stderr) building framework!');
          }

          resultObject.success = true;
          return callback(null, 'Framework built');
        });
    },
    function(callback) {
      self.clearBuildFlag(path.join(BUILD_FOLDER, Constants.Filenames.Rebuild), function(err) {
        callback(null);
      });
    },
    function(callback) {
      if (mode === Constants.Modes.Preview || mode === Constants.Modes.Build) { // No download required -- skip this step
        return callback();
      }
      // Now zip the build package
      var filename = path.join(COURSE_FOLDER, Constants.Filenames.Download);
      var zipName = helpers.slugify(outputJson['course'].title);
      var output = fs.createWriteStream(filename);
      var archive = archiver('zip');

      output.on('close', function() {
        resultObject.filename = filename;
        resultObject.zipName = zipName;
        callback();
      });
      archive.on('error', function(err) {
        logger.log('error', err);
        callback(err);
      });
      archive.pipe(output);
      archive.glob('**/*', { cwd: path.join(BUILD_FOLDER) });
      archive.finalize();
    }
  ], function(err) {
    if (err) {
      logger.log('error', err);
      return next(err);
    }
    next(null, resultObject);
  });
};

AdaptTenantPublish.prototype.writeCourseAssets = function(courseTenantName, tenantId, courseId, jsonDestinationFolder, destinationFolder, jsonObject, next) {

  fs.remove(destinationFolder, function(err) {
    if (err) {
      return next(err);
    }

    // Remove any existing assets
    fs.ensureDir(destinationFolder, function(err) {
      if (err) {
        return next(err);
      }
      // Fetch assets used in the course
      database.getDatabase(function (err, db) {
        if (err) {
          return next(err);
        }

        // Retrieve a distinct list of assets.
        db.retrieve('courseasset', {_courseId: courseId, _contentType: {$ne: 'theme'}}, {operators: {distinct: '_assetId'}}, function (err, results) {
          if (err) {
            logger.log('error', err);
            return next(err);
          }
          if (results) {
            var assetsJson = {};

            // Retrieve the details of every asset used in this course.
            //Amended for builder multi tenancy
            assetmanager.retrieveAsset({ _id: {$in: results} }, { _tenantId: tenantId }, function (error, assets) {
              if (error) {
                logger.log('error', err);
                return next(error);
              }

              async.eachSeries(assets, function(asset, callback) {
                var outputFilename = path.join(destinationFolder, asset.filename);

                assetsJson[asset.filename] = { 'title': asset.title, 'description': asset.description, 'tags': asset.tags };

                // TODO -- This global replace is intended as a temporary solution
                var replaceRegex = new RegExp("course/assets/" + asset.filename, 'gi');

                var lang = jsonObject['config']._defaultLanguage;
                var newAssetPath = "course/" + lang + "/assets/" + encodeURIComponent(asset.filename);

                Object.keys(Constants.CourseCollections).forEach(function(key) {
                  jsonObject[key] = JSON.parse(JSON.stringify(jsonObject[key]).replace(replaceRegex, newAssetPath));
                });

                // AB-59 - can't use asset record directly - need to use storage plugin
                filestorage.getStorage(asset.repository, function (err, storage) {
                  if (err) {
                    logger.log('error', err.message, err);
                    return callback(err);
                  }

                  // pass through the new tenant name so storage can find the correct asset path.
                  var options = { tenantName: courseTenantName };

                  return storage && storage.createReadStream(asset.path, options, function (ars) {
                    var aws = fs.createWriteStream(outputFilename);
                    ars.on('error', function (err) {
                      logger.log('error', 'Error copying ' + asset.path + ' to ' + outputFilename + ": " + err.message);
                      return callback('Error copying ' + asset.path + ' to ' + outputFilename + ": " + err.message);
                    });
                    ars.on('end', function () {
                      return callback();
                    });
                    ars.pipe(aws);
                  });
                });
              }, function(err) {
                if (err) {
                  logger.log('error', 'Error processing course assets');
                  return next(err);
                }
                var data = JSON.stringify(assetsJson, undefined, 2);
                var filename = path.join(jsonDestinationFolder, Constants.Filenames.Assets);

                fs.outputFile(filename, data, function(err) {
                  if (err) {
                    logger.log('error', 'Error saving assets.json');
                    return next(err);
                  }
                  logger.log('info', 'All assets processed');
                  return next(null, jsonObject);
                });
              });
            }); // retrieveAsset()
          } else {
            // There are no assets to process
            return next(null, jsonObject);
          }
        }); //courseasset
      }, tenantId);
    });  // ensureDir()
  });
};


/**
 * essential setup
 *
 * @api private
 */
function initialize () {
  var self = this;
  var app = origin();
  app.once('serverStarted', function (server) {
    /**
     * API Endpoint to build a course on another tenant
     * Only allowed for Super user of master tenant
     */
    rest.get('/astutebuild/:tenant/:course', function (req, res, next) {
      var course = req.params.course;
      var tenantId = req.params.tenant;
      var currentUser = usermanager.getCurrentUser();
      var userTenantId = currentUser.tenant && currentUser.tenant._id;
      var mode = Constants.Modes.Publish;

      if (!tenantId) {
        res.statusCode = 500;
        return res.json('Could not find Tenant Id');
      }

      if (!userTenantId) {
        res.statusCode = 500;
        return res.json('Could not find current tenant');
      }

      helpers.isUserMasterSuperAdmin(currentUser._id, userTenantId, function(error, isSuper) {
        if (!isSuper) {
          res.statusCode = 401;
          return res.json({success: false});
        }
      });

      new AdaptTenantPublish().publish(tenantId, course, mode, req, res, function (error, result) {
        if (error) {
          logger.log('error', 'Unable to publish');
          res.statusCode = 500;
          return res.json({ success: false, message: error.message });
        }
        res.statusCode = 200;
        return res.json(result);
      });
    });

    /**
     * API Endpoint to download a course on another tenant
     * Only allowed for Super user of master tenant
     */
    rest.get('/astutedownload/:tenant/:course/:title/download.zip', function (req, res, next) {
      var tenantId = req.params.tenant;
      var courseId = req.params.course;
      var FRAMEWORK_ROOT_FOLDER = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
      var downloadZipFilename = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.AllCourses, tenantId, courseId, Constants.Filenames.Download);
      var zipName = req.params.title;
      var currentUser = usermanager.getCurrentUser();
      var userTenantId = currentUser.tenant && currentUser.tenant._id;

      helpers.isUserMasterSuperAdmin(currentUser._id, userTenantId, function(error, isSuper) {
        if (error || !isSuper) {
          res.statusCode = 401;
          return res.json({success: false});
        } else {
          fs.stat(downloadZipFilename, function(err, stat) {
            if (err) {
              logger.log('error', 'Error calling fs.stat');
              logger.log('error', err);

              next(err);
            } else {
              res.writeHead(200, {
                  'Content-Type': 'application/zip',
                  'Content-Length': stat.size,
                  'Content-disposition' : 'attachment; filename=' + zipName + '.zip',
                  'Pragma' : 'no-cache',
                  'Expires' : '0'
              });

              var readStream = fs.createReadStream(downloadZipFilename);

              readStream.pipe(res);
            }
          });
        }
      });
    });
  });
};

// setup AdaptTenantPublish
initialize();

/**
 * Module exports
 *
 */

exports = module.exports = AdaptTenantPublish;

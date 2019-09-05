// external
const archiver = require('archiver');
const async = require('async');
const exec = require('child_process').exec;
const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');
// internal
const configuration = require('../../../lib/configuration');
const Constants = require('../../../lib/outputmanager').Constants;
const helpers = require('../../../lib/helpers');
const installHelpers = require('../../../lib/installHelpers');
const logger = require('../../../lib/logger');
const origin = require('../../../');
const usermanager = require('../../../lib/usermanager');
const database = require('../../../lib/database');

function publishXAPI(tenant, courseId, mode, request, response, next) {

  var app = origin();
  var self = this;
  var user = usermanager.getCurrentUser();
  var tenantId = user.tenant._id;
  var outputJson = {};
  var isRebuildRequired = false;
  var themeName = '';
  var menuName = Constants.Defaults.MenuName;
  var frameworkVersion;

  var resultObject = {};

  // shorthand directories
  var FRAMEWORK_ROOT_FOLDER = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
  var SRC_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.Source);
  var COURSES_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.AllCourses);
  var COURSE_FOLDER = path.join(COURSES_FOLDER, tenantId, courseId);
  var BUILD_FOLDER = path.join(COURSE_FOLDER, Constants.Folders.Build);

  var customPluginName = user._id;

  const getGruntFatalError = stdout => {
    const indexStart = stdout.indexOf('\nFatal error: ');

    if (indexStart === -1) return;

    const indexEnd = stdout.indexOf('\n\nExecution Time');

    return stdout.substring(indexStart, indexEnd !== -1 ? indexEnd : stdout.length);
  }

  async.waterfall([
    // get an object with all the course data
    function(callback) {
      self.getCourseJSON(tenantId, courseId, function(err, data) {
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
      self.applyTheme(tenantId, courseId, outputJson, temporaryThemeFolder, function(err, appliedThemeName) {
        if (err) {
          return callback(err);
        }

        self.writeCustomStyle(tenantId, courseId, temporaryThemeFolder, function(err) {
          if (err) {
            return callback(err);
          }
          // Replace the theme in outputJson with the applied theme name.
          themeName = appliedThemeName;
          outputJson['config'][0]._theme = themeName;
          callback(null);
        });
      });
    },
    function(callback) {
      self.sanitizeCourseJSON(mode, outputJson, function(err, data) {
        if (err) {
          return callback(err);
        }

        // Update the JSON object with xAPI data
         replaceSpoorWithXAPI(data, function(error, courseData) {
           if (error) {
             return callback(error);
           }
           outputJson = courseData
           return callback(null);
         });

      });
    },
    function(callback) {
      self.buildFlagExists(path.join(BUILD_FOLDER, Constants.Filenames.Rebuild), function(err, exists) {
        if (err) {
          return callback(err);
        }

        if (mode === Constants.Modes.Export || mode === Constants.Modes.Publish) {
          isRebuildRequired = true;
          return callback(null);
        }

        const isForceRebuld = (request) ? request.query.force === 'true' : false;
        isRebuildRequired = exists || isForceRebuld;
        callback(null);
      });
    },
    function(callback) {
      var temporaryMenuFolder = path.join(SRC_FOLDER, Constants.Folders.Menu, customPluginName);
      self.applyMenu(tenantId, courseId, outputJson, temporaryMenuFolder, function(err, appliedMenuName) {
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

      self.writeCourseAssets(tenantId, courseId, assetsJsonFolder, assetsFolder, outputJson, function(err, modifiedJson) {
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
      fs.exists(path.join(BUILD_FOLDER, Constants.Filenames.Main), function(exists) {
        if (!isRebuildRequired && exists) {
          resultObject.success = true;
          return callback(null, 'Framework already built, nothing to do');
        }

        logger.log('info', '3.1. Ensuring framework build exists');

        var args = [];
        var outputFolder = COURSE_FOLDER.replace(FRAMEWORK_ROOT_FOLDER + path.sep,'');

        // Append the 'build' folder to later versions of the framework
        if (semver.gte(semver.clean(frameworkVersion), semver.clean('2.0.0'))) {
          outputFolder = path.join(outputFolder, Constants.Folders.Build);
        }
        // hack to allow courses to build pre FW v2.3.1 where theme and menu defaults were defines in schema
        if (!themeName) themeName = "adapt-contrib-vanilla";

        if (!menuName) menuName = "adapt-contrib-boxMenu";


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
              error.message += getGruntFatalError(stdout) || '';
              resultObject.success = true;
              return callback(error, 'Error building framework');
            }

            if (stdout.length != 0) {
              logger.log('info', 'stdout: ' + stdout);
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
      });
    },
    function(err, callback) {
      self.clearBuildFlag(path.join(BUILD_FOLDER, Constants.Filenames.Rebuild), function(err) {
        callback(null);
      });
    },
    function(callback) {
      if (mode === Constants.Modes.Preview) { // No download required -- skip this step
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
        // Indicate that the zip file is ready for download
        app.emit('zipCreated', tenantId, courseId, filename, zipName);
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

  // Process config for xapi

  function replaceSpoorWithXAPI(courseData, cb) {
    // check if we have spoor enabled
    if (!courseData.config || !courseData.config._enabledExtensions || !courseData.config._enabledExtensions.spoor) return cb(null, courseData);
    if (!courseData.course && !courseData.course.title) return cb("No Course Title");

    // Set activityId replace all non alphanumeric characters
    let activityId = 'https://delta-net.co.uk/xapi/' + courseData.course.title.replace(/[\W_]+/g,'-').toLowerCase();
    let xapiExtensionDef = {"_isEnabled":true,"_specification":"xAPI","_activityID":activityId,"_endpoint":"","_user":"","_password":"","_lang":"en-US","_generateIds":false,"_shouldTrackState":true,"_componentBlacklist":"blank,graphic","_coreEvents":{"Adapt":{"router:menu":false,"router:page":false,"questionView:recordInteraction":true,"assessments:complete":true},"contentObjects":{"change:_isComplete":true},"articles":{"change:_isComplete":false},"blocks":{"change:_isComplete":false},"components":{"change:_isComplete":false}},"_lrsFailureBehaviour":"show"};
    var xapiExtension = {};
    let spoorName = 'adapt-contrib-spoor';
    let xapiGlobals = {"confirm":"OK","lrsConnectionErrorTitle":"LRS not available","lrsConnectionErrorMessage":"We were unable to connect to your Learning Record Store (LRS). This means that your progress cannot be recorded."};

    // get the xapi extension data
    database.getDatabase(function (err, db) {
      if (err) {
        return cb(err);
      }

      db.retrieve('extensiontype', { name: spoorName }, function (err, results) {
        if (err) {
          return cb(err);
        }
        //TODO - check we have a result
        let extensionItem = results[0];
        let targetAttribute = extensionItem.targetAttribute;
        xapiExtension = {
          _id: extensionItem._id,
          name: extensionItem.name,
          version: extensionItem.version,
          targetAttribute: targetAttribute
        };
        logger.log('info', 'xapiExtension: ' + xapiExtension);
        courseData.config._enabledExtensions.xapi = xapiExtension;
        // replace build.includes
        let buildArray = _.toArray(courseData.config.build.includes);
        buildArray.splice(buildArray.indexOf('adapt-contrib-spoor'), 1);
        buildArray.push('adapt-contrib-xapi');
        courseData.config.build.includes = buildArray;

        // delete spoor enabledExtensions
        delete courseData.config._enabledExtensions.spoor;

        // replace config JSON
        delete courseData.config._spoor;
        courseData.config._xapi = xapiExtensionDef;

        // replace _globals
        courseData.course._globals._extensions._xapi = xapiGlobals;

        logger.log('info', JSON.stringify(courseData));
        return cb(null, courseData);
      });
    }, configuration.getConfig('dbName'));
  }
}

module.exports = publishXAPI;

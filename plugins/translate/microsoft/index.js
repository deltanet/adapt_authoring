// external
const request = require('request');
const uuidv4 = require('uuid/v4');
const util = require('util');
const async = require('async');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs-extra');

// internal
const TranslationManager = require('../../../lib/translationmanager')
const TranslationPlugin = TranslationManager.TranslationPlugin;
const TranslationError = TranslationManager.errors.TranslationError;
const TranslationPermissionError = TranslationManager.errors.TranslationPermissionError;
const Constants = require('../../../lib/translationmanager').Constants;
const logger = require('../../../lib/logger');
const origin = require('../../../');
const rest = require('../../../lib/rest');
const configuration = require('../../../lib/configuration');
const database = require("../../../lib/database");
const usermanager = require('../../../lib/usermanager');
const OutputPlugin = require('../../../lib/outputmanager').OutputPlugin;
//debugger;

function MicrosoftTranslate() {
}
util.inherits(MicrosoftTranslate, TranslationPlugin);

const translateServiceEndpoint = getEndPoint();
const translateServiceKey = getKey();

/**
 * essential setup
 *
 * @api private
 */
function initialize () {
  let app = origin();

  app.once('serverStarted', function(server) {
    /**
     * API Endpoint to translate text
     */
    rest.post('/translate', function (req, res, next) {
      let origText = req.body.text;
      let toLang = req.body.to;

      translateText(origText, toLang, function(error, body) {
        if (error) {
          logger.log('error', error);
          return res.status(500).json(error);
        }

        // return the translated text.
        // response will be an array, what should be done for multiple entries
        if (body.length && body.length > 0) {
          let translationsArray = body[0].translations;
          if (translationsArray.length && translationsArray.length > 0) {
            return res.status(200).json(translationsArray[0].text);
          } else {
            return res.status(404).json({ success:false });
          }
        } else {
          return res.status(404).json({ success:false });
        }
      });
    });

    /**
     * API Endpoint to translate whole course
     */
    rest.post('/translatecourse/:courseid', function (req, res, next) {
      const courseId = req.params.courseid;
      translateCourse(courseId, req, res, function(error, record) {
        if (error) {
          res.statusCode = 400;
          return res.json({success: false, message: error.message});
        }
        if (typeof record !== 'object') {
          logger.log('error', 'Translate Course error, response body is not an object: ' + JSON.stingify(body));
          return res.status(500).json({ success:false });
        }

        /**
         * @event courseDuplicated
         * @type object
         */
        app.emit('courseDuplicated', record);
        res.statusCode = 200;
        return res.json({success: true, newCourseId: record._id});
      });
    });
  });
}

/*
* main function to translate single piece of text
* TODO - convert to async await
*/
function translateText(origText, toLang, cb) {
  if (typeof origText !== "string" || typeof toLang !== "string") return("Translation text or selected language code is not a string");

  let options = {
    method: 'POST',
    baseUrl: translateServiceEndpoint,
    url: 'translate',
    qs: {
      'api-version': '3.0',
      'to': [toLang]
    },
    headers: {
      'Ocp-Apim-Subscription-Key': translateServiceKey,
      'Content-type': 'application/json',
      'X-ClientTraceId': uuidv4().toString()
    },
    body: [{
      'text': origText
    }],
    json: true,
  };

  request(options, function(error, response) {
    if (error) return cb(error);
    if (typeof response !== 'object' || !response.body) {
      logger.log('error', 'Translation Text error, response body is not an object: ' + JSON.stingify(response));
      error = 'Translation Text error, response body is not an object: ' + JSON.stringify(response);
    }
    if (response.error) {
      error = 'Translation Text error: ' + JSON.stringify(response.error);
    }
    return cb(error, response.body);
  });
}

/*
* main function to translate a course
* TODO - convert to async await
*/

function translateCourse(courseId, req, res, next) {
  logger.log('info', 'Translating: ' + courseId);

    processTranslation(courseId)
      .then(translatedCourse => {
        // need to update the database here

        next(null, translatedCourse);
      })
      .catch(error => next(error));
};


function getEndPoint() {
  var endpoint = configuration.getConfig('microsoftTranslateEndpoint');
  if (!endpoint) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateEndpoint');
  }
  return endpoint;
}

function getKey() {
  var subscriptionKey = configuration.getConfig('microsoftTranslateKey');
  if (!subscriptionKey) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateKey');
  }
  return subscriptionKey;
}

function translatable(obj) {
  Object.keys(obj).forEach(function(key) {
    var value = obj[key];
    if (value) {
      switch (typeof value) {
        case "object":
          translatable(value);
          break;
        case "string":
          logger.log('info', 'key: ' + key + ' value: ' + value);
          // test if translatable
          break;
      }
    }
  })
}

const getCourseJSON = function(courseId) {
  return new Promise((resolve, reject) => {
    app.contentmanager.getContentPlugin("course", function(error, plugin) {
      if(error) return reject(error);
      plugin.retrieve({ _id: courseId }, {}, function(error, docs) {
        if(error) return reject(error);
        if(docs.length !== 1) {
          return reject("Failed to find course " + courseId);
        }
        resolve(docs[0]);
      });
    });
  });
};

const processTranslation = function(courseId) {
  return new Promise((resolve, reject) => {
    if (!courseId || typeof courseId !== 'string') reject("No course to translate");

    let user = usermanager.getCurrentUser();
    let tenantId = user.tenant._id;
    let coursePublishJson = {};
    let gruntOutputJson = {};
    let translateResultObject = {};
    let cachedJson = {};

    let dbInstance;
    let sourceLang = 'en'; // TODO - use value from form input
    let targetLang = 'fr'; // TODO - use value from form input

    // TODO - Create file in FS to indicate that translation is in progress for this course
    let isInTranslation = false

    const FRAMEWORK_ROOT_FOLDER = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
    const COURSE_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.AllCourses, tenantId, courseId);
    const TRANSLATE_FOLDER = path.join(COURSE_FOLDER, Constants.Folders.Languagefiles);
    const TRANSLATE_SOURCE_FOLDER = path.join(TRANSLATE_FOLDER, Constants.Folders.TranslationSource);
    const TRANSLATE_GRUNT_FOLDER = path.join(TRANSLATE_FOLDER, Constants.Folders.TranslationOutput);
    const TRANSLATE_FINAL_FOLDER = path.join(TRANSLATE_FOLDER, Constants.Folders.TranslationFinal);
    const GRUNT_OUTPUT_FILE = path.join(TRANSLATE_GRUNT_FOLDER, sourceLang, Constants.Folders.TranslationJSONFile);
    const GRUNT_INPUT_FILE = path.join(TRANSLATE_GRUNT_FOLDER, targetLang, Constants.Folders.TranslationJSONFile);
    const getGruntFatalError = stdout => {
      const indexStart = stdout.indexOf('\nFatal error: ');

      if (indexStart === -1) return;

      const indexEnd = stdout.indexOf('\n\nExecution Time');

      return stdout.substring(indexStart, indexEnd !== -1 ? indexEnd : stdout.length);
    }

    //create DB instance
    database.getDatabase(function(error, db) {
      if(error) return reject(error);
      dbInstance = db;
    });

    async.waterfall([
      // get an object with all the course data
      function(callback) {
        OutputPlugin.prototype.getCourseJSON(tenantId, courseId, function(err, data) {
          if (err) {
            return callback(err);
          }
          // Store off the retrieved collections
          coursePublishJson = data;
          callback(null);
        });
      },
      function(callback) {
        OutputPlugin.prototype.sanitizeCourseJSON('PUBLISH', coursePublishJson, function(err, data) {
          if (err) {
            return callback(err);
          }
          // Update the JSON object
          coursePublishJson = data;
          callback(null);
        });
      },
      // delete the existing build folder
      function(callback) {
        // Ensure that the build folder is empty
        fs.emptyDir(TRANSLATE_FOLDER, err => {
          logger.log('info', 'Translation directory emptied');
          if (err) logger.log('error', err);

          callback(err);
        })
      },
      function(callback) {
        OutputPlugin.prototype.writeCourseJSON(coursePublishJson, path.join(TRANSLATE_SOURCE_FOLDER, Constants.Folders.Course), function(err) {
          if (err) {
            return callback(err);
          }
          callback(null);
        });
      },
      function(callback) {
        let args = [];

        args.push('--targetLang=' + sourceLang);
        args.push('--format=json');
        args.push('--languagedir=' + TRANSLATE_GRUNT_FOLDER);
        args.push('--outputdir=' + TRANSLATE_SOURCE_FOLDER);

        logger.log('info', 'grunt translate:export --format=json --languagedir=' + TRANSLATE_SOURCE_FOLDER + ' --outputdir=' + TRANSLATE_GRUNT_FOLDER);

        child = exec('grunt translate:export ' + args.join(' '), {cwd: path.join(FRAMEWORK_ROOT_FOLDER)},
          function(error, stdout, stderr) {
            if (error !== null) {
              logger.log('error', 'exec error: ' + error);
              logger.log('error', 'stdout error: ' + stdout);
              error.message += getGruntFatalError(stdout) || '';
              translateResultObject.success = true;
              return callback(error, 'Error running translation export');
            }

            if (stderr.length != 0) {
              logger.log('error', 'stderr: ' + stderr);
              translateResultObject.success = false;
              return callback(stderr, 'Error (stderr) creating tranlsation files!');
            }

            translateResultObject.success = true;
            return callback();
          });
      },
      function(callback) {
        // make sure the grunt translate file buildFlagExists
        fs.exists(path.join(GRUNT_OUTPUT_FILE), function(exists) {
          if (!exists) return callback({ success:false, message: "Grunt translate file does not exist" });
          return callback();
        });
      },
      function(callback) {
        // read grunt translate output and populate gruntOutputJson
        fs.readFile(GRUNT_OUTPUT_FILE, 'utf8', function(err, file) {
          if (err) {
            logger.log('error', err);
            return callback(err);
          }
          gruntOutputJson = JSON.parse(file);
          return callback();
        });
      },
      function(callback) {
        let translatedData = [];
        if (typeof gruntOutputJson !== 'object') {
          logger.log('error', 'Translation file is not JSON');
          return callback('Translation file is not JSON');
        }

        async.eachSeries(gruntOutputJson, function(item, cb) {
          translateText(item.value, targetLang, function(error, body) {
            if (error) return callback(error);
            let translatedText = "";
            if (body.length && body.length > 0) {
              let translationsArray = body[0].translations;
              if (translationsArray.length && translationsArray.length > 0) {
                translatedText = translationsArray[0].text;
              } else {
                return cb({ success:false });
              }
            } else {
              return cb({ success:false });
            }

            let newItem = {
              "file": item.file,
              "id": item.id,
              "path": item.path,
              "value": translatedText
            };
            translatedData.push(newItem);
            return cb();
          });
        }, function(err) {
          if (err) {
            logger.log('error', err);
            callback(err);
          }

          fs.outputFile(GRUNT_INPUT_FILE, JSON.stringify(translatedData), 'utf8')
          .then(() => {
            logger.log('info', 'file write completed.')
            callback();
          })
          .catch(err => {
            logger.log('error', err);
            callback(err);
          })
        });
      },
      function(callback) {
        // run grunt import command
        let args = [];

        args.push('--targetLang=' + targetLang);
        args.push('--format=json');
        args.push('--replace');
        args.push('--languagedir=' + TRANSLATE_GRUNT_FOLDER);
        args.push('--outputdir=' + TRANSLATE_SOURCE_FOLDER);

        logger.log('info', 'grunt translate:import --format=json --replace --targetLang=' + targetLang + ' --languagedir=' + TRANSLATE_GRUNT_FOLDER + ' --outputdir=' + TRANSLATE_SOURCE_FOLDER);

        child = exec('grunt translate:import ' + args.join(' '), {cwd: path.join(FRAMEWORK_ROOT_FOLDER)},
          function(error, stdout, stderr) {
            if (error !== null) {
              logger.log('error', 'exec error: ' + error);
              logger.log('error', 'stdout error: ' + stdout);
              error.message += getGruntFatalError(stdout) || '';
              translateResultObject.success = true;
              return callback(error, 'Error running translation import');
            }

            if (stderr.length != 0) {
              logger.log('error', 'stderr: ' + stderr);
              translateResultObject.success = false;
              return callback(stderr, 'Error (stderr) importing tranlsation files!');
            }

            // clean up source Folders
            fs.remove(path.join(TRANSLATE_SOURCE_FOLDER, Constants.Folders.Course, sourceLang) , err => {
              if (err) return callback(err);
              translateResultObject.success = true;
              return callback();
            })
          });
      },
      function(callback) {
        // retrieve translated JSON
        return callback();
      },
      function(callback) {
        // create new course with cachedJson
        return callback();
      },
      function(callback) {
        // enable Plugins
        return callback();

      },
      function(callback) {
        // copy assets
        return callback();
      }
    ], function(err) {
      if (err) {
        logger.log('error', err);
        reject(err);
      }
      resolve(translateResultObject);
    });
  });
};

// setup translate
initialize();

// module exports
module.exports = MicrosoftTranslate;

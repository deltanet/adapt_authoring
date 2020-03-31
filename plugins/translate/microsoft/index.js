// external
const request = require('request');
const uuidv4 = require('uuid/v4');
const util = require('util');
const async = require('async');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs-extra');
const _ = require('underscore');

// internal
const translationManager = require('../../../lib/translationmanager')
const TranslationPlugin = translationManager.TranslationPlugin;
const TranslationError = translationManager.errors.TranslationError;
const TranslationPermissionError = translationManager.errors.TranslationPermissionError;
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
const translateTextApiUri = 'https://api.cognitive.microsofttranslator.com/languages?api-version=3.0';
const API_OPTIONS = {};

/**
 * essential setup
 *
 * @api private
 */
function initialize () {
  let app = origin();

  app.once('serverStarted', function(server) {

    /**
     * API Endpoint to get available languages
     */
    rest.get('/translate/languages', function (req, res, next) {
      // should return an object list or language objects
      let options = API_OPTIONS;
      getLanguages(options, function(error, languages) {
        if (error) {
          logger.log('error', error);
          return res.status(500).json(error);
        }

        if (languages && typeof languages === 'object') {
          return res.status(200).json(languages);
        } else {
          return res.status(404).json({ success:false });
        }
      });
    });

    /**
     * API Endpoint to translate text
     */
    rest.post('/translate/text', function (req, res, next) {
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
    rest.post('/translate/course/:courseid', function (req, res, next) {
      let origCourseId = req.params.courseid;
      let requestBody = req.body;
      if (!origCourseId) {
        res.statusCode = 400;
        return res.json('Translate Course error, no course ID');
      }
      if (!requestBody || 'object' !== typeof requestBody) {
        res.statusCode = 400;
        return res.json({ success: false, message: 'request body was not a valid object' });
      }
      if (!requestBody.targetLang || 'string' !== typeof requestBody.targetLang) {
        res.statusCode = 400;
        return res.json({ success: false, message: 'could not determine target language' });
      }
      let targetLang = requestBody.targetLang;
      translateCourse(origCourseId, targetLang, function(error, record) {
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
        res.statusCode = 200;
        return res.json({success: true, newCourseId: record._id});
      });
    });
  });
}

/*
*
*
*/

function getLanguages(options, cb) {

  let translateTextOptions = {
    method: 'get',
    uri: translateTextApiUri,
    qs: {
      'scope': 'translation'
    },
    json: true,
  };

  request(translateTextOptions, function(error, response) {
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

function translateCourse(courseId, targetLang, next) {
  logger.log('info', 'Translating: ' + courseId);

  translationManager.getSourceLang(courseId, function(error, sourceLang) {
    if (error || !sourceLang) {
      let errorMessage = error ? error : 'Source language not found';
      logger.log('error', errorMessage);
      reject(error);
    }

    processTranslation(courseId, sourceLang, targetLang)
      .then(translatedCourse => {
        // need to update the database here
        next(null, translatedCourse);
      })
      .catch(error => next(error));
  });
};


function getEndPoint() {
  let endpoint = configuration.getConfig('microsoftTranslateEndpoint');
  if (!endpoint) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateEndpoint');
  }
  return endpoint;
}

function getKey() {
  let subscriptionKey = configuration.getConfig('microsoftTranslateKey');
  if (!subscriptionKey) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateKey');
  }
  return subscriptionKey;
}

const processTranslation = function(origCourseId, sourceLang, targetLang) {
  return new Promise((resolve, reject) => {
    if (!origCourseId || typeof origCourseId !== 'string') reject("No course to translate");

    let availableLanguages = {};
    let originalCourseData = {};
    let coursePublishJson = {};
    let gruntOutputJson = {};
    let translateResultObject = {};
    let cachedJson = {};
    let metadata = {
      idMap: {}
    };

    let pluginLocations = {};
    let dbInstance;
    // TODO - Create file to indicate that translation is in progress for this course

    const contentMap = {
      course: 'course',
      config: 'config',
      contentobject: 'contentObjects',
      article: 'articles',
      block: 'blocks',
      component: 'components'
    };

    const plugindata = {
      pluginTypes: [
        { type: 'component', folder: 'components' },
        { type: 'extension', folder: 'extensions', attribute: '_extensions' },
        { type: 'menu',      folder: 'menu',       attribute: 'menuSettings' },
        { type: 'theme',     folder: 'theme',      attribute: 'themeSettings' }
      ]
    };

    const user = usermanager.getCurrentUser();
    const tenantId = user.tenant._id;
    const FRAMEWORK_ROOT_FOLDER = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
    const COURSE_FOLDER = path.join(FRAMEWORK_ROOT_FOLDER, Constants.Folders.AllCourses, tenantId, origCourseId);
    const TRANSLATE_FOLDER = path.join(COURSE_FOLDER, Constants.Folders.Languagefiles);
    const TRANSLATE_SOURCE_FOLDER = path.join(TRANSLATE_FOLDER, Constants.Folders.TranslationSource);
    const TRANSLATE_GRUNT_FOLDER = path.join(TRANSLATE_FOLDER, Constants.Folders.TranslationOutput);
    const GRUNT_OUTPUT_FILE = path.join(TRANSLATE_GRUNT_FOLDER, sourceLang, Constants.Folders.TranslationJSONFile);
    const GRUNT_INPUT_FILE = path.join(TRANSLATE_GRUNT_FOLDER, targetLang, Constants.Folders.TranslationJSONFile);
    const getGruntFatalError = stdout => {
      const indexStart = stdout.indexOf('\nFatal error: ');

      if (indexStart === -1) return;

      const indexEnd = stdout.indexOf('\n\nExecution Time');

      return stdout.substring(indexStart, indexEnd !== -1 ? indexEnd : stdout.length);
    };

    const storeComponentType = (cb) => {
      dbInstance.retrieve('componenttype', {}, { jsonOnly: true }, function(error, results) {
        if(error) {
          return cb(error);
        }
        metadata['componentMap'] = {};
        async.each(results, function(plugin, cb2) {
          const properties = plugin.properties;
          metadata['componentMap'][plugin['component']] = {
            targetAttribute: plugin.targetAttribute,
            version: plugin.version,
            name: plugin.name,
            _id: plugin._id
          };
          cb2();
        }, cb);
      });
    };

    const transformContent = (type, originalData) => {
      return new Promise(async (resolve, reject) => {
        let data = _.extend({}, originalData);
        /**
        * Basic prep of data
        */
        delete data._id;
        delete data._trackingId;
        delete data._latestTrackingId;
        data.createdBy = app.usermanager.getCurrentUser()._id;
        if(type !== 'course') {
          data._courseId = newCourseId;
        }
        if(data._component) {
          data._componentType = metadata.componentMap[data._component]._id;
        }
        if(data._parentId) {
          if(metadata.idMap[data._parentId]) {
            data._parentId = metadata.idMap[data._parentId];
          } else {
            logger.log('warn', 'Cannot update ' + originalData._id + '._parentId, ' +  originalData._parentId + ' not found in idMap');
            return resolve();
          }
        }

        /**
        * Define the custom properties and and pluginLocations
        */
        let genericPropKeys = Object.keys(dbInstance.getModel(type).schema.paths);
        let customProps = _.pick(data, _.difference(Object.keys(data), genericPropKeys));

        if(_.isEmpty(customProps)) return resolve(data);

        plugindata.pluginTypes.forEach(function(typeData) {
          if(!pluginLocations[typeData.type]) return;

          let pluginKeys = _.intersection(Object.keys(customProps), Object.keys(pluginLocations[typeData.type]));

          if(pluginKeys.length === 0) return;

          data[typeData.attribute] = _.pick(customProps, pluginKeys);
          data = _.omit(data, pluginKeys);
          customProps = _.omit(customProps, pluginKeys);
        });
        // everything else is a customer property
        data.properties = customProps;
        data = _.omit(data, Object.keys(customProps));

        resolve(data);
      });
    };

    const createContentItem = (type, originalData, done) => {
      let data;
      // TODO - re-organise flow
      async.series([
        function transform(cb) {
          transformContent(type, originalData).then(transformedData => {
            data = transformedData;
            cb();
          }).catch(cb);
        }
      ], function(error, results) {
        if(error) return done(error);
        app.contentmanager.getContentPlugin(type, function(error, plugin) {
          if(error) return done(error);
          plugin.create(data, function(error, record) {
            if(error) {
              logger.log('warn', 'Failed to create ' + type + ' ' + (originalData._id || '') + ' ' + error);
              return done(error);
            }
            return done(null, record);
          });
        });
      });
    };

    /**
    * Stores plugin metadata for use later
    */
    const cacheMetadata = (done) => {
      async.each(plugindata.pluginTypes, storePlugintype, done);
    }

    const storePlugintype = (pluginTypeData, cb) => {
      const type = pluginTypeData.type;
      dbInstance.retrieve(`${type}type`, {}, { jsonOnly: true }, function(error, results) {
        if(error) {
          return cb(error);
        }
        async.each(results, function(plugin, cb2) {
          const properties = plugin.properties;
          const locations = properties && properties.pluginLocations;
          if(!metadata[`${type}Map`]) {
            metadata[`${type}Map`] = {};
          }
          metadata[`${type}Map`][plugin[type]] = {
            targetAttribute: plugin.targetAttribute,
            version: plugin.version,
            name: plugin.name,
            _id: plugin._id
          };
          if(locations) {
            if(!pluginLocations[type]) {
              pluginLocations[type] = {};
            }
            pluginLocations[type][plugin.targetAttribute] = locations;
          }
          cb2();
        }, cb);
      });
    }


    //create DB instance
    database.getDatabase(function(error, db) {
      if(error) return reject(error);
      dbInstance = db;
    });

    getLanguages({}, function(error, languages) {
      if (error) {
        logger.log('error', error);
        return;
      }

      if (!languages || typeof languages !== 'object') return;
      if (languages.hasOwnProperty('translation')) {
        availableLanguages = languages['translation'];
      }
      return;
    });

    async.waterfall([
      // get an object with all the course data
      function(callback) {
        OutputPlugin.prototype.getCourseJSON(tenantId, origCourseId, function(err, data) {
          if (err) {
            return callback(err);
          }
          // Store off the retrieved collections
          coursePublishJson = data;
          originalCourseData = JSON.parse(JSON.stringify(data));  // clone course object in original form
          callback();
        });
      },
      function(callback) {
        OutputPlugin.prototype.sanitizeCourseJSON('PUBLISH', coursePublishJson, function(err, data) {
          if (err) {
            return callback(err);
          }
          coursePublishJson = data;
          callback();
        });
      },
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
          callback();
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
              translateResultObject.success = false;
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
        // make sure the grunt translate file exists
        fs.exists(path.join(GRUNT_OUTPUT_FILE), function(exists) {
          if (!exists) return callback({ success:false, message: "Grunt translate file does not exist" });
          return callback();
        });
      },
      function(callback) {
        // read grunt translate output and populate gruntOutputJson
        fs.readFile(GRUNT_OUTPUT_FILE, 'utf8', function(err, file) {
          if (err) {
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
            callback(err);
          }

          fs.outputFile(GRUNT_INPUT_FILE, JSON.stringify(translatedData), 'utf8')
          .then(() => {
            logger.log('info', 'file write completed.')
            callback();
          })
          .catch(err => {
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
              translateResultObject.success = false;
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
              return callback();
            })
          });
      },
      function(callback) {
        // retrieve translated JSON
        async.eachSeries(Object.keys(contentMap), function(type, cb) {
          let jsonPath = path.join(TRANSLATE_SOURCE_FOLDER, Constants.Folders.Course, (type !== 'config') ? targetLang : '', `${contentMap[type] || type}.json`);
          fs.readJson(jsonPath, function(error, jsonData) {
            if(error) {
              return callback(error);
            }
            cachedJson[type] = jsonData;
            cb();
          });
        }, callback);
      },
      function(callback) {
        cacheMetadata(function(error) {
          if (error) callback(error);
          return callback();
        });
      },
      function(callback) {
        // create new course with cachedJson
        async.eachSeries(Object.keys(contentMap), function(type, cb2) {
          let contentJson = cachedJson[type];
          switch(type) {
            case 'course': {
              let origCourseJson = originalCourseData.course[0];
              let themeSettings = origCourseJson.themeSettings || {};
              let customStyle = origCourseJson.customStyle || "";
              contentJson.themeSettings = themeSettings;
              contentJson.customStyle = customStyle;

              createContentItem(type, contentJson, function(error, courseRec) {
                if(error) return cb2(error);
                metadata.idMap[contentJson._id] = courseRec._id;
                newCourseId = metadata.idMap[origCourseId] = courseRec._id;
                translateResultObject._id = newCourseId;
                cb2();
              });
              return;
            }
            case 'config': {
              let origCourseJson = originalCourseData.config[0];
              let targetDirection = origCourseJson._defaultDirection;
              if (availableLanguages[targetLang] && availableLanguages[targetLang].dir) {
                targetDirection = availableLanguages[targetLang].dir;
              }
              let editorOnlyConfig = {
                _defaultLanguage: targetLang,
                _defaultDirection: targetDirection,
                _theme: origCourseJson._theme,
                _menu: origCourseJson._menu,
                _enabledExtensions: origCourseJson._enabledExtensions,
                _enabledComponents: origCourseJson._enabledComponents
              }
              _.extend(contentJson, editorOnlyConfig);
              createContentItem(type, contentJson, cb2);
              return;
            }
            case 'contentobject': { // Sorts in-place the content objects to make sure processing can happen
              let byParent = _.groupBy(contentJson, '_parentId');
              Object.keys(byParent).forEach(id => {
                byParent[id].forEach((item, index) => item._sortOrder = index + 1);
              });
              let groups = _.groupBy(contentJson, '_type');
              let sortedSections = translationManager.sortContentObjects(groups.menu, origCourseId, []);
              contentJson = sortedSections.concat(groups.page);
            }
          }
          // assume we're using arrays
          async.eachSeries(contentJson, function(item, cb3) {
            createContentItem(type, item, function(error, contentRec) {
              if(error) {
                return cb3(error);
              }
              if(!contentRec || !contentRec._id) {
                logger.log('warn', 'Failed to create map for '+ item._id);
                return cb3();
              }
              metadata.idMap[item._id] = contentRec._id;
              cb3();
            });
          }, cb2);
        }, function(err) {
          callback(err);
        });
      },
      function(callback) {
        // clone courseassets
        dbInstance.retrieve('courseasset', {_courseId: origCourseId}, { jsonOnly: true }, function(error, results) {
          if(error) {
            return callback(error);
          }

          async.each(results, function(courseAsset, cb2) {
            let newCourseAsset = {
              _courseId: metadata.idMap[courseAsset._courseId],
              _contentTypeParentId: metadata.idMap[courseAsset._contentTypeParentId]
            };
            newCourseAsset = _.extend(courseAsset, newCourseAsset);
            delete newCourseAsset._id;
            dbInstance.create('courseasset', newCourseAsset, function(err, courseAssetRecord) {
              if (err) {
                return cb2(err);
              }
              cb2();
            })
          }, callback);
        });
      }
    ], function(err) {
      if (err) {
        logger.log('error', err);
        reject(err);
      }
      translateResultObject.success = true;
      // TODO - clean up temp folders
      resolve(translateResultObject);
    });
  });
};

// setup translate
initialize();

// module exports
module.exports = MicrosoftTranslate;

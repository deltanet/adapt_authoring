/*
* Base module for translations
*/

// external
const util = require('util');
const EventEmitter = require('events').EventEmitter;

// local
const configuration = require('./configuration');
const permissions = require('./permissions');
const logger = require('./logger');
const rest = require('./rest');
const pluginmanager = require('./pluginmanager');
const database = require('./database');
const usermanager = require('./usermanager');
const contentmanager = require('./contentmanager');
const ContentPlugin = contentmanager.ContentPlugin;

/*
 * CONSTANTS
 */
var MODNAME = 'translationmanager',
    WAITFOR = 'pluginmanager';

    var Constants = {
        translationFile: 'export.json',
        Folders: {
            Languagefiles: 'languagefiles',
            TranslationSource: 'translationsrc',
            TranslationOutput: 'translationoutput',
            TranslationFinal: 'translationfinal',
            TranslationJSONFile: 'export.json',
            AllCourses: 'courses',
            Build: 'build',
            Source: 'src',
            Course: 'course',
            Temp: 'temp',
            Extensions: 'extensions',
            Components: 'components',
            Framework: 'adapt_framework',
            Plugins: 'plugins'
        },
        Filenames: {
          Bower: 'bower.json',
          Package: 'package.json',
          Assets: 'assets.json'
        }
    };

// errors
function TranslationError (message) {
  this.name = 'TranslationError';
  this.message = message || 'Translation error';
};

util.inherits(TranslationError, Error);

function TranslationPermissionError (message) {
  this.name = 'TranslationPermissionError';
  this.message = message || 'You are not permitted to do that';
};

util.inherits(TranslationPermissionError, Error);

/**
 * base constructor for translate plugins
 * @api public
 */
function TranslationPlugin () {

}

/**
* base function for translating a string, to be over written by the plugin
* @param {text} string
* @param {lang} string
* @param {next} callback
*/
TranslationPlugin.prototype.translateText = function(text, lang, next) {
  logger.log('error', 'TranslatePlugin#translateText must be implemented by extending objects!');
  throw new Error('TranslatePlugin#translateText must be implemented by extending objects!');
};

/**
* base function for translating a course, to be over written by the plugin
* @param {text} string
* @param {object} req
* @param {object} res
* @param {callback} next
*/
TranslationPlugin.prototype.translateCourse = function(id, req, res, next) {
  logger.log('error', 'TranslatePlugin#translateCourse must be implemented by extending objects!');
  throw new Error('TranslatePlugin#translateCourse must be implemented by extending objects!');
};

/**
* copies course and translates all translatable text
* @param {target language} string
* @param {course ID} string
* @param {callback} next
*/
TranslationPlugin.prototype.duplicateCourse = function(targetLang, courseId, next) {




};


/**
 * TranslationManager class
 */

function TranslationManager () {
  this._translationTypes = Object.create(null);
}

// TranslationManager is an eventemitter
util.inherits(TranslationManager, EventEmitter);

/**
 * loads translate plugins - intended to be called once during bootstrapping
 *
 * @param {callback} next
 */

TranslationManager.prototype.loadTranslatePlugins = function (next) {
  var self = this;
  var pluginManager = pluginmanager.getManager();
  pluginManager.getPlugin('translate', function (err, plugins){
    async.eachSeries(
      Object.keys(plugins),
      function (pluginName, nextPlugin) {
        self.getTranslatePlugin(pluginName, nextPlugin);
      },
      next
    );
  });
};

/**
 * gets a translate plugin instance
 *
 * @param {string} type - the type(name) of the translate plugin
 * @param {callback} cb
 */

TranslationManager.prototype.getTranslatePlugin = function (type, cb) {
  var self = this;

  var pluginManager = pluginmanager.getManager();
  pluginManager.getPlugin('translat', type, function (error, pluginInfo) {
    if (error) {
      return cb(new TranslationError('content type plugin ' + type + ' was not found'));
    }

    try {
      var TranslationPlugin = require(pluginInfo.fullPath);
      self._translationTypes[type] = new TranslationPlugin(); // not sure we need to memoize
      cb(null, self._translationTypes[type]);
    } catch (err) {
      return cb(err);
    }
  });
};


/**
* create course, returns new course record
* @param {data} object
* @param {callback} next
*/
TranslationManager.prototype.createCourse = function(data, next) {
  let parentIdMap = [];

  app.contentmanager.getContentPlugin('course', function(error, plugin) {
    if(error) return next(error);
    plugin.create(data, function(error, record) {
      if(error) {
        logger.log('warn', 'Failed to import ' + type + ' ' + (data._id || '') + ' ' + error);
        return next(error);
      } // Create a courseAssets record if needed
      createCourseAssets(data._id, parentIdMap, db, error => next(error, record));
    });
  });
};

/**
* create course record
* @param {string} old course ID
* @param {array} object
* @param {object} object
* @param {callback} next
*/
TranslationManager.prototype.createCourseAssets = function(oldCourseId, parentIdMap, db, next) {

  db.retrieve('courseasset', {_courseId: oldCourseId}, function(error, items) {
    if (error) {
      logger.log('error', error);
      next(error);
    } else {
      async.each(items, function(item, cb) {
        // For each course asset, before inserting the new document
        // the _courseId, _contentTypeId and _contentTypeParentId must be changed
        if (parentIdMap[item._contentTypeParentId]) {
          var courseAsset = item.toObject();
          delete courseAsset._id;

          courseAsset._courseId = newCourseId;
          courseAsset._contentTypeId = parentIdMap[item._contentTypeId];
          courseAsset._contentTypeParentId = parentIdMap[item._contentTypeParentId];

          return db.create('courseasset', courseAsset, function (error, newCourseAsset) {
            if (error) {
              logger.log('error', error);
              return cb(error);
            } else {
              cb();
            }
          });
        } else {
          cb();
        }
      }, function(error) {
        if (error) {
          logger.log('error', error);
          next(error);
        } else {
          next(null);
        }
      });
    }
  });
};

exports = module.exports = {
  // expose the output manager constructor
  TranslationManager : TranslationManager,

  // expose the output plugin constructor
  TranslationPlugin : TranslationPlugin,

  // expose the constants
  Constants : Constants,

  // expose errors
  errors: {
    TranslationError: TranslationError,
    TranslationPermissionError: TranslationPermissionError
  },

  /**
   * preload function
   *
   * @param {object} app - the Origin instance
   * @return {object} preloader - a ModulePreloader
   */
  preload : function (app) {
    var preloader = new app.ModulePreloader(app, MODNAME, { events: this.preloadHandle(app, new TranslationManager()) });
    return preloader;
  },

  /**
   * Event handler for preload events
   *
   * @param {object} app - Server instance
   * @param {object} instance - Instance of this module
   * @return {object} hash map of events and handlers
   */
  preloadHandle : function (app, instance){
    return {
      preload : function(){
        var preloader = this;
        preloader.emit('preloadChange', MODNAME, app.preloadConstants.WAITING);
      },
      moduleLoaded : function(modloaded){
        var preloader = this;
         //is the module that loaded this modules requirement
        if(modloaded === WAITFOR){
          app.translationmanager = instance;
          //instance.setupRoutes();
          instance.loadTranslatePlugins(function () {
            preloader.emit('preloadChange', MODNAME, app.preloadConstants.COMPLETE);
          });
          //preloader.emit('preloadChange', MODNAME, app.preloadConstants.COMPLETE);
        }
      }
    };
  }
};

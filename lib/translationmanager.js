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

/*
 * CONSTANTS
 */
var MODNAME = 'translationmanager',
    WAITFOR = 'pluginmanager';

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

TranslationPlugin.prototype.translateText = function(id, text, req, res, next) {
  logger.log('error', 'TranslatePlugin#translateText must be implemented by extending objects!');
  throw new Error('TranslatePlugin#translateText must be implemented by extending objects!');
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
      return cb(new ContentTypeError('content type plugin ' + type + ' was not found'));
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

exports = module.exports = {
  // expose the output manager constructor
  TranslationManager : TranslationManager,

  // expose the output plugin constructor
  TranslationPlugin : TranslationPlugin,

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

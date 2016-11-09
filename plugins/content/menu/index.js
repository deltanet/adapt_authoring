// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/**
 * Menu content plugin
 *
 */

var origin = require('../../../'),
    contentmanager = require('../../../lib/contentmanager'),
    rest = require('../../../lib/rest'),
    BowerPlugin = require('../bower'),
    ContentPlugin = contentmanager.ContentPlugin,
    ContentTypeError = contentmanager.errors.ContentTypeError,
    configuration = require('../../../lib/configuration'),
    usermanager = require('../../../lib/usermanager'),
    database = require('../../../lib/database'),
    helpers = require('../../../lib/helpers'),
    logger = require('../../../lib/logger'),
    defaultOptions = require('./defaults.json'),
    bower = require('bower'),
    rimraf = require('rimraf'),
    async = require('async'),
    fs = require('fs'),
    ncp = require('ncp').ncp,
    mkdirp = require('mkdirp'),
    _ = require('underscore'),
    util = require('util'),
    path = require('path');

var bowerConfig = {
  type: 'menutype',
  keywords: 'adapt-menu',
  packageType: 'menu',
  srcLocation: 'menu',
  options: defaultOptions,
  extra: [ "targetAttribute" ],
  nameList: [],
  updateLegacyContent: function (newPlugin, oldPlugin, next) {
    // Not required for menus
    return next();
  }
};

function Menu () {
  this.bowerConfig = bowerConfig;
};

util.inherits(Menu, BowerPlugin);

/**
 * implements ContentObject#getModelName
 *
 * @return {string}
 */
Menu.prototype.getModelName = function () {
  return 'menu';
};

/**
 *
 * @return {string}
 */
Menu.prototype.getPluginType = function () {
  return 'menutype';
};

/**
 * Overrides base.retrieve
 *
 * @param {object} search
 * @param {object} options
 * @param {callback} next
 */
Menu.prototype.retrieve = function (search, options, next) {
  // shuffle params
  if ('function' === typeof options) {
    next = options;
    options = {};
  }

  if (!options.populate) {
    options.populate = { '_menuType': ['displayName'] };
  }

  ContentPlugin.prototype.retrieve.call(this, search, options, next);
};

/**
 * retrieves an array of menutype items that have been enabled on a particular course
 *
 * @param {string} courseId
 * @param {callback} cb
 */
function getEnabledMenu(courseId, cb) {
  database.getDatabase(function (error, db) {
    if (error) {
      return cb(error);
    }

    // should we delegate this feature to the config plugin?
    db.retrieve('config', { _courseId: courseId }, function (error, results) {
      if (error) {
        return cb(error);
      }

      if (!results || 0 === results.length) {
        logger.log('info', 'could not retrieve config for course ' + courseId);
        return cb(null, []);
      }

      // get the menu based on the _menu attribute
      // TODO - this does not need to be an array
      var enabledMenu = results[0]._menu;
      logger.log('info', 'menu - ' + enabledMenu);
      db.retrieve('menutype', { name: enabledMenu }, cb);
    });
  });
}

function contentDeletionHook(contentType, data, cb) {
  var contentData = data[0];

  if (!contentData._id) {
    return cb(null, data);
  }

  // TODO - Remove globals?
  return cb(null, data);
}

function get_type(thing){
    if(thing===null)return "[object Null]"; // special case
    return Object.prototype.toString.call(thing);
}

/**
 * hook to modify a newly created content item based on enabled menu for a course
 *
 * @param {string} contentType
 * @param {array} data
 * @param {callback} cb
 */
function contentCreationHook(contentType, data, cb) {
  logger.log('info', 'contentCreationHook - ' + contentType);
  // in creation, data[0] is the content
  var contentData = data[0];
  if (!contentData._courseId) {
    // cannot do anything for unknown courses
    return cb(null, data);
  }

  // TODO - we should check that the menu has properties otherwise return

  // Start the async bit
  async.series([
    function(callback) {
      getEnabledMenu(contentData._courseId, function (error, menu) {
        logger.log('info', menu[0]);
        var menuTypeThing = get_type(menu[0]);
        logger.log('info', menuTypeThing);
        if (error) {
          // permit content creation to continue, but log error
          logger.log('error', 'could not load menu: ' + error.message);
          return callback(null);
        }

        contentData.menuSettings = {};
        menu.forEach(function (menuItem) {
          if (menuItem.properties.hasOwnProperty('pluginLocations') && menuItem.properties.pluginLocations.properties[contentType]) {
            var schema = menuItem.properties.pluginLocations.properties[contentType].properties; // yeesh
            var generatedObject = helpers.schemaToObject(schema, menuItem.name, menuItem.version, contentType);
            contentData.menuSettings = _.extend(contentData.menuSettings, generatedObject);
          }
        });

        // assign back to passed args
        data[0] = contentData;
        callback(null);
      });
    }
  ],
  function(err, results) {
    if (err) {
      logger.log('error', err);
      return cb(err);
    }

    return cb(null, data);
  });






}


/**
 *  add/remove menu JSON from content
 *  only supports one menu
 *
 * @params courseId {string}
 * @params menu {object} [menu ID]
 * @param {callback} cb
*/
function toggleMenu (courseId, menu, cb) {
logger.log('info', 'toggleMenu - ' + menu);


}

// TODO - add other content types, currently only supports contentObject
// add content creation hooks for each viable content type, can add more

['contentobject'].forEach(function (contentType) {
  app.contentmanager.addContentHook('create', contentType, contentCreationHook.bind(null, contentType));
});

/**
 * essential setup
 *
 * @api private
 */
function initialize () {
BowerPlugin.prototype.initialize.call(new Menu(), bowerConfig);

  var app = origin();
  app.once('serverStarted', function (server) {

    // enable a menu
    // expects course ID and a menu ID
    rest.post('/menu/:menuid/makeitso/:courseid', function (req, res, next) {
      var menuId = req.params.menuid;
      var courseId = req.params.courseid;

      // add selected menu to course config
      database.getDatabase(function (err, db) {
        if (err) {
          return next(err);
        }

        database.getDatabase(function(err, masterDb) {
          if (err) {
            return next(err);
          }

          // verify it's a valid menu
          masterDb.retrieve('menutype', { _id: menuId }, function (err, results) {
            if (err) {
              return next(err);
            }

            if (!results || 1 !== results.length) {
              res.statusCode = 404;
              return res.json({ success: false, message: 'menu not found' });
            }

            // update the course config object
            db.update('config', { _courseId: courseId }, { _menu: results[0].name }, function (err) {
              if (err) {
                return next(err);
              }

              // toggleMenu - add/remove menu JSON from content
              toggleMenu(courseId, results[0].name, function(error, result) {
                if (error) {
                  res.statusCode = error instanceof ContentTypeError ? 400 : 500;
                  return res.json({ success: false, message: error.message });
                }
              });

              // if we successfully changed the menu, we need to force a rebuild of the course
              var user = usermanager.getCurrentUser();
              var tenantId = user.tenant._id;
              if (!tenantId) {
                // log an error, but don't fail
                logger.log('error', 'failed to determine current tenant', user);
                res.statusCode = 200;
                return res.json({ success: true });
              }


              app.emit('rebuildCourse', tenantId, courseId);

              res.statusCode = 200;
              return res.json({success: true});
            });
          });
        }, configuration.getConfig('dbName'));
      });
    });
  });
};

// setup menu
initialize();

/**
 * Module exports
 *
 */

exports = module.exports = Menu;

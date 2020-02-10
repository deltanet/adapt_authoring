// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/**
 * Tenant Course Content plugin type
 * Plugin for tenant courses, locked down to super user from master tenant DB
 */

var contentmanager = require('../../../lib/contentmanager');
var ContentPlugin = contentmanager.ContentPlugin;
var ContentPermissionError = contentmanager.errors.ContentPermissionError;
var ContentTypeError = contentmanager.errors.ContentTypeError;
var configuration = require('../../../lib/configuration');
var permissions = require('../../../lib/permissions');
var util = require('util');
var async = require('async');
var origin = require('../../../');
var rest = require('../../../lib/rest');
var _ = require('underscore');
var logger = require('../../../lib/logger');
var database = require('../../../lib/database');
var helpers = require('../../../lib/helpers');
var usermanager = require('../../../lib/usermanager');
var rolemanager = require('../../../lib/rolemanager');


function TenantCourses () {
}

util.inherits(TenantCourses, ContentPlugin);

var DASHBOARD_COURSE_FIELDS = [
    '_id', '_tenantId', '_type', '_isShared', 'title', 'heroImage',
    'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'tags'
];

/**
 * overrides base implementation of hasPermission
 *
 * @param {string} action
 * @param {objectid} userId
 * @param {objectid} userTenantId
 * @param {object} contentItem content item
 * @param {callback} next (function (err, isAllowed))
 */
TenantCourses.prototype.hasPermission = function (action, userId, tenantId, contentItem, next) {
  helpers.hasCoursePermission(action, userId, tenantId, contentItem, function(err, isAllowed) {
    if (err) {
      return next(err);
    }
    if (isAllowed) {
      return next(null, isAllowed);
    }
    var resource = permissions.buildResourceString(tenantId, `/api/content/course/${contentItem._courseId || '*'}`);
    permissions.hasPermission(userId, action, resource, next);
  });
};

/**
 * implements ContentObject#getModelName
 *
 * @return {string}
 */
TenantCourses.prototype.getModelName = function () {
  return 'course';
};

/**
 * overrides base implementation of retrieve
 *
 * @param {object} search
 * @param {object} options
 * @param {callback} next
 */
TenantCourses.prototype.retrieve = function (search, options, next) {
  var user = app.usermanager.getCurrentUser();
  var userTenantId = user.tenant && user.tenant._id;
  var tenantId = options && options._tenantId ? options._tenantId : userTenantId;

  // must have a model name
  if (!this.getModelName()) {
    return next(new ContentTypeError('this.getModelName() must be set!'));
  }

  // Ensure the tags are populated
  var pop = { tags: '_id title' };
  if (!options.populate) {
    options.populate = pop;
  } else {
    options.populate = _.extend(pop, options.populate);
  }

  var self = this;
  database.getDatabase(function (error, db) {
    if (error) {
      return next(error);
    }

    db.retrieve(self.getModelName(), search, options, function (err, records) {
      if (err) {
        return next(err);
      }

      async.each(records, function(contentItem, callback) {
        if (contentItem._type === 'course') {
          self.hasCoursePermission('retrieve', user._id, userTenantId, tenantId, contentItem, function (err, isAllowed) {
            if (!isAllowed) {
              return callback(new ContentPermissionError());
            }

            callback();
          });
        } else {
          self.hasPermission('retrieve', user._id, tenantId, contentItem, function (err, isAllowed) {
            if (!isAllowed) {
              return callback(new ContentPermissionError());
            }

            callback();
          });
        }
      }, function (error) {
        if (error) {
          return next(new ContentPermissionError());
        }

        return next(null, records);
      });
    });
  }, (options && options._tenantId));
};

/**
 * overrides lib/helpers implementation of hasCoursePermission
 *
 * @param {string} action
 * @param {objectid} userId
 * @param {objectid} userTenantId
 * @param {objectid} tenantId
 * @param {object} contentItem content item
 * @param {callback} next
 */

TenantCourses.prototype.hasCoursePermission = function (action, userId, userTenantId, tenantId, contentItem, next) {
  // Check that the contentItem has something resembling a courseId
  if (contentItem && typeof contentItem._id === 'undefined' && typeof contentItem._courseId === 'undefined') {
    // Course permission cannot be verified
    return next(null, false);
  }

  if (tenantId && typeof tenantId === 'undefined' && userTenantId && typeof userTenantId === 'undefined') {
    // Course permission cannot be verified
    return next(null, false);
  }

  var self = this;
  helpers.isUserMasterSuperAdmin(userId, userTenantId, function(error, isSuper) {
    if (isSuper) {
      // Shared courses on the same tenant are open to users on the same tenant
      return next(null, true);
    } else {
      return next(null, false);
    }
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
     * API Endpoint to query courses on another tenant
     * Only allowed for Super user of master tenant
     */
    // list tenant courses route
    rest.get('/tenant/:tenantId/courses', function (req, res, next) {
      var tenantId = req.params.tenantId;
      var options = _.keys(req.body).length
      ? req.body
      : req.query;

      if (!tenantId) {
        res.statusCode = 500;
        return res.json('Could not find Tenant Id');
      }

      options.jsonOnly = true;
      options.fields = DASHBOARD_COURSE_FIELDS.join(' ');

      options = _.extend(options, { _tenantId: tenantId });

      // Only return courses for this tenant id
      var query = { _tenantId: tenantId };

      new TenantCourses().retrieve(query, options, function (err, results) {
        if (err) {
          res.statusCode = 500;
          return res.json(err);
        }
        return res.json(results);
      });
    });
  });
};

// setup TenantCourses
initialize();

/**
 * Module exports
 *
 */

exports = module.exports = TenantCourses;

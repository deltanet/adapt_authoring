// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/**
 * Course Content plugin type
 */

var contentmanager = require('../../../lib/contentmanager');
var tenantmanager = require('../../../lib/tenantmanager');
var ContentPlugin = contentmanager.ContentPlugin;
var configuration = require('../../../lib/configuration');
var permissions = require('../../../lib/permissions');
var util = require('util');
var path = require('path');
var async = require('async');
var origin = require('../../../');
var rest = require('../../../lib/rest');
var _ = require('underscore');
var logger = require('../../../lib/logger');
var database = require('../../../lib/database');
var helpers = require('../../../lib/helpers');
var usermanager = require('../../../lib/usermanager');
var assetmanager = require('../../../lib/assetmanager');
var filestorage = require('../../../lib/filestorage');

function ReplicateCourse () {
}


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
     * API Endpoint to replicate a course, copy a course to another tenant
     * API needs to copy course to a tenant, add policy statement for a tenant user
     * @fires ~courseReplicated
     */
    // add course replicate route - @TODO - Restrict access to this!
    rest.get('/duplicatecourse/:course/:user', function (req, res, next) {
      var courseId = req.params.course;
      var userId = req.params.user;

      if (!courseId || 'string' !== typeof courseId) {
        res.statusCode = 400;
        return res.json({ success: false, message: 'course id is required' });
      }

      if (!userId || 'string' !== typeof userId) {
        res.statusCode = 400;
        return res.json({ success: false, message: 'user id is required' });
      }

      replicate({ _id: courseId, userId: userId }, function (error, newCourse) {
        if (error) {
          res.statusCode = 400;
          return res.json({success: false, message: error.message});
        }
        /**
         * @event courseDuplicated
         * @type object
         */
        app.emit('courseReplicated', newCourse);
        res.statusCode = 200;
        return res.json({success: true, newCourseId: newCourse._id});
      });
    });
  });
}

/**
 * overrides base implementation of hasPermission
 *
 * @param {string} action
 * @param {object} a content item
 * @param {callback} next (function (err, isAllowed))
 */
function hasPermission (action, userId, tenantId, contentItem, next) {
  helpers.hasCoursePermission(action, userId, tenantId, contentItem, function(err, isAllowed) {
    if (err) {
      return next(err);
    }

    if (!isAllowed) {
      // Check the permissions string
      if (contentItem.hasOwnProperty('_courseId')) {
        var resource = permissions.buildResourceString(tenantId, '/api/content/course/' + contentItem._courseId);
        permissions.hasPermission(userId, action, resource, next);
      } else {
        // This is a brand new course
        return next(null, true);
      }
    } else {
      return next(null, isAllowed);
    }
  });
};

/**
 * implements ContentObject#getModelName
 *
 * @return {string}
 */
function getModelName () {
  return 'course';
};

/**
 * implements ContentObject#getChildType
 *
 * @return {string}
 */
function getChildType () {
  return ['contentobject', 'config'];
};

/**
 * Overrides base.create in order to pass the new tenant ID to the getDatabase function
 * @param {object} data
 * @param {callback} next
 */

 function create (data, options, next) {
  // shuffle params
  if ('function' === typeof options) {
    next = options;
    options = {};
  }

  var self = this;
  var user = data.user || usermanager.getCurrentUser();
  var tenantId = user._tenantId;

  //ContentPlugin.prototype.create.call(self, data, { _tenantId: tenantId }, function (err, doc) {
  // must have a model name
  if (!getModelName()) {
    return next(new ContentTypeError('getModelName() must be set!'));
  }

  data._type = data._type || getModelName();
  data._tenantId = options._tenantId || user.tenant._id;

  database.getDatabase(function (error, db) {
    if (error) {
      return next(error);
    }

    data.createdAt = data.createdAt || new Date();
    data.updatedAt = data.updatedAt || new Date();

    // Check if the user has permission on this course
    hasPermission('create', user._id, data._tenantId, data, function (err, isAllowed) {
      if (!isAllowed) {
        return next(new ContentPermissionError());
      }
      return db.create(getModelName(), data, function(error, doc) {
        // grant the creating user full editor permissions
        permissions.createPolicy(user._id, function (err, policy) {
          if (err) {
            logger.log('error', 'there was an error granting editing permissions', err);
          }

          var resource = permissions.buildResourceString(tenantId, '/api/content/course/' + doc._id);
          permissions.addStatement(policy, ['create', 'read', 'update', 'delete'], resource, 'allow', function (err) {
            if (err) {
              logger.log('error', 'there was an error granting editing permissions', err);
            }
            return next(null, doc);
          });
        });
      });
    });
  }, (options && options._tenantId));
};

/**
 * copies an asset to a new tenant. A physical and database copy will be made.
 *
 * @param {string} id - copying requires that the asset be identified by id
 * @param {object} user - the new asset must be copied to a tenant and be created by a valid user of that tenant
 * @param {callback} next - function (err)
 */

function copyAssetToTenant (id, user, next) {
  // TODO need to check for id and user
  var self = this;
  async.waterfall([
    function getAssetData(cb) {
      // get the original asset
      assetmanager.retrieveAsset({ _id: id }, function (error, assetRec) {
        if (error) {
          return next(error);
        }

        if (!assetRec || assetRec.length !== 1) {
          logger.log('error', "Asset not found");
          return next("Asset not found");
        }
        return cb(null, assetRec[0]);
      });
    },
    function getNewTenantName(assetRec, cb) {
      // get the tenant names
      tenantmanager.retrieveTenant({ _id: user._tenantId }, function (error, tenantRecs) {
        if (error) {
          logger.log('error', error);
          return cb(error);
        }

        if (!tenantRecs) {
          logger.log('error', "New tenant not found");
          return cb("New tenant not found");
        }
        var currentUser = usermanager.getCurrentUser();
        var tenantNames = { oldTenantName: currentUser.tenant.name, newTenantName: tenantRecs.name };
        return cb(null, assetRec, tenantNames);

      });
    },
    function mapTags(assetRec, tenantNames, cb) {
      var newTags = [];

      //if (assetRec && assetRec.tags) {
      if (!assetRec || 'object' !== typeof assetRec) {
        return cb(null, assetRec, tenantNames, newTags);
      } else {
        var assetTags = assetRec.tags

        createTags(assetTags, user, function(error, newTags) {
          if (error || !newTags) {
            var tagError = error || "Error: cannot create tags";
            return cb(tagError);
          }
          return cb(null, assetRec, tenantNames, newTags);
        });
      }
    },
    function duplicateAsset(assetRec, tenantNames, newTags, cb) {
      var oldAsset = assetRec.toObject();
      var repository = configuration.getConfig('filestorage') || 'localfs';

      // check if similar asset already exixts in new tenant, we do not want duplicatecourse
      // if similar return that ID
      var search = {
        title: oldAsset.title,
        size: oldAsset.size
      };
      //TODO  -  this needs to be duplicated in this class
      retrieveAsset(search, { _tenantId: user._tenantId }, function gotAsset(error, results) {
        if (error) {
          logger.log('error', error);
          return next(error);
        }

        if(results.length > 0) {
          return cb(null, {_id: results[0]._id});
        } else {
          // write the file to some file storage
          filestorage.getStorage(repository, function (storageError, storage) {
            if (storageError) {
              return next(storageError);
            }

            storage.copyAsset(oldAsset, tenantNames.oldTenantName, tenantNames.newTenantName, function (error) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              }
              var assetTags = newTags || {};
              var asset = _.extend(oldAsset, {
                  repository: repository,
                  isDirectory: false,
                  createdBy: user._id,
                  tags: newTags,
                  dateCreated: new Date()
                }
              );

              delete asset._id;

              // Create the asset record
              createAsset( asset, { _tenantId: user._tenantId }, function (createError, newAsset) {
                if (createError) {
                  logger.log('error', createError);

                  // if the record creation fails, remove the file that was uploaded
                  storage.deleteFile(newAsset.path, function (delErr) {
                    if (delErr) {
                      // record the delete error, but we really want the creation failure error in the callback
                      logger.log('error', 'Failed to delete stored file in assetmanager', newAsset.path);
                    }

                    // Indicate that an error has occurred
                    return cb("An error occured during upload, please contact an Administrator.");
                  });

                  return cb("An error occured during upload, please contact an Administrator.");
                }
                cb(null, {_id: newAsset._id});
              });
            });
          });
        }
      });
    }
  ], function(error, results) {
    next(error, results);
  });
};

/**
 * default implementation of retrieve
 *
 * @param {object} search
 * @param {object} options
 * @param {callback} next
 */
function retrieve (search, options, next) {
  var user = app.usermanager.getCurrentUser();
  var tenantId = user.tenant && user.tenant._id;
  // must have a model name
  if (!getModelName()) {
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

    db.retrieve(getModelName(), search, options, function (err, records) {
      if (err) {
        return next(err);
      }

      async.each(records, function(contentItem, callback) {
        if (contentItem._type === 'course') {
          helpers.hasCoursePermission('retrieve', user._id, tenantId, contentItem, function (err, isAllowed) {
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
  }, (options && options.tenantId));
};

/**
 * creates a new asset, Like assetmanager.create but creates on the new tenant
 * This is not very DRY, but perhaps better that hacking the core code until core lib modules can handle different tenants
 *
 * @param {object} data - the attributes for the asset
 * @param {object} [options] - attributes has new tenan
 * @param {callback} next - function (err, asset)
 */

function createAsset (data, options, next) {
  // shuffle params
  if ('function' === typeof options) {
    next = options;
    options = {};
  }

  var user = options.user || usermanager.getCurrentUser();
  var tenantId = options && options._tenantId || user.tenant && user.tenant._id;
  var self = this;

  database.getDatabase(function (error, db) {
    if (error) {
      return next(error);
    }

    // set creation date
    if (!data.createdAt) {
      data.createdAt = new Date();
    }

    db.create('asset', data, function (err, doc) {
      if (err) {
        return next(err);
      }

      permissions.createPolicy(user._id, function (err, policy) {
        if (err) {
          logger.log('error', 'there was an error granting editing permissions', err);
        }

        var resource = permissions.buildResourceString(tenantId, '/api/asset/' + doc._id);
        permissions.addStatement(policy, ['create', 'read', 'update', 'delete'], resource, 'allow', function (err) {
          if (err) {
            logger.log('error', 'there was an error granting editing permissions', err);
          }
          return next(null, doc);
        });
      });
    });

  }, tenantId);
};


/**
 * retrieves an/multiple asset record(s)
 *
 * @param {object} search - fields to search on
 * @param {object} [options] - optional query param
 * @param {callback} next - function (err, asset)
 */
function retrieveAsset (search, options, next) {
  var __this = this;
  // shuffle params
  if ('function' === typeof options) {
    next = options;
    options = {};
  }
  // Ensure the tags are populated
  var pop = { tags: '_id title' };
  if (!options.populate) {
    options.populate = pop;
  } else {
    options.populate = _.extend(pop, options.populate);
  }

  database.getDatabase(function (error, db) {
    if (error) {
      return next(error);
    }
    var user = usermanager.getCurrentUser();
    // only return deleted assets if user has correct permissions
    hasPermission('delete', user._id, user.tenant._id, '*', function(error, isAllowed) {
      if (error) {
        return next(error);
      }
      if(!isAllowed) {
        search = _.extend(search, { _isDeleted: false });
      }
      db.retrieve('asset', search, options, next);
    });
  }, (options && options._tenantId));
};


/**
 * Duplicate a course
 * @param {array} data
 * @param {callback} cb
 */
function replicate (data, cb) {
  if (!data) {
    return cb(null);
  }

  var self = this;
  logger.log('info', 'Copying course to tenant');
  async.waterfall([
    function validateData(cb) {
      if (!data.userId) {
        cb(new Error('No user Id found'));
      } else if (!data._id) {
        cb(new Error('No course Id found'));
      } else {
        cb(null);
      }
    },
    function getUserData(cb) {
      usermanager.retrieveUser({ _id: data.userId }, function(error, result) {
        if (error) {
          return cb(error);
        } else if (result) {
          return cb(null, result);
        } else {
          cb(new Error('No matching user record found'));
        }
      });
    },
    function copyCourseHeroImage(user, cb) {
      if (!user || 'object' !== typeof user) {
        return cb("there was an error copying assets");
      }
      var parentIdMap = {};

      retrieve({_id: data._id}, {}, function (error, courses) {
        if (error) {
          return cb(error);
        }
        if (courses && courses.length) {
          var course = courses[0].toObject();
          if (course && course.heroImage &&'string' == typeof course.heroImage) {
            database.getDatabase(function (error, db) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              }
              // Assuming there are no errors the assets must set the course assets
              assetmanager.retrieveAsset({ _id: course.heroImage }, function(error, items) {
                if (error) {
                  logger.log('error', error);
                  return cb(error);
                } else {
                  async.eachSeries(items, function(item, next) {
                    copyAssetToTenant(item, user, function(error, newAssetId) {
                      if (error || !newAssetId || 'object' != typeof newAssetId) {
                        var copyError = error || "Error - cannot copy asset to tenant";
                        return cb(copyError);
                      }

                      parentIdMap[item._id] = newAssetId._id;
                      next();
                    });
                  }, function(error) {
                    if (error) {
                      logger.log('error', error);
                      return cb(error);
                    } else {
                      cb(null, user, parentIdMap);
                    }
                  });
                }
              });
            });
          } else {
            // do nothing if no hero image
            return cb(null, user, parentIdMap);
          }
        } else {
          // do nothing if no hero image
          cb(null, user, parentIdMap);
        }
      });
    },
    function copyCourse(user, parentIdMap, cb) {
      // Get the original item
      retrieve({_id: data._id}, {}, function (error, docs) {
        if (error) {
          return cb(error);
        }
        if (docs && docs.length) {
          var doc = docs[0].toObject();
          var oldCourseId = doc._id;

          delete doc._id;

          // As this is a new course, no preview is yet available
          doc._hasPreview = false;

          // set a new date for created and updated
          doc.createdAt = new Date();
          doc.updatedAt = new Date();
          // Set the current user's ID as the creator
          doc.createdBy = user._id;
          doc._isShared = true;
          doc.user = user;
          doc.heroImage = parentIdMap[doc.heroImage];

          create(doc, { _tenantId: user._tenantId }, function (error, newCourse) {
            if (error) {
              logger.log('error', error);
              return cb(error);
            }
            var newCourseId = newCourse._id;

            database.getDatabase(function (error, db) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              }

              async.eachSeries(['contentobject', 'article', 'block', 'component', 'config'], function (contenttype, nextContentType) {
                db.retrieve(contenttype, {_courseId: oldCourseId}, function (error, items) {
                  if (error) {
                    logger.log('error', error);
                    return nextContentType(error);
                  }

                  if (!parentIdMap.length) {
                    parentIdMap[oldCourseId] = newCourseId;
                  }

                  if (contenttype == 'contentobject') {
                    items = sortContentObjects(items);
                  }

                  async.eachSeries(items, function (item, next) {
                    var contentData = item.toObject();
                    var oldId = contentData._id;
                    var oldParentId = contentData._parentId;

                    delete contentData._id;
                    contentData._courseId = newCourseId;
                    contentData._parentId = parentIdMap[oldParentId];
                    if (contenttype !== 'config' || contenttype !== 'component') {
                      contentData._tenantId = user._tenantId;
                    }

                    database.getDatabase(function (error, db) {
                      if (error) {
                        logger.log('error', error);
                        return cb(error);
                      }

                      return db.create(contenttype, contentData, function (error, newContent) {
                        if (error) {
                          logger.log('error', error);
                          return next(error);
                        }
                        parentIdMap[oldId] = newContent._id;
                        next();
                      });
                    }, user._tenantId);

                  }, function (error) {
                    if (error) {
                      logger.log('error', error);
                      return cb(error);
                    }

                    nextContentType(null);
                  });
                });
              }, function (error) {
                if (error) {
                  logger.log('error', error);
                  return cb(error, newCourse);
                } else {
                  cb(null, user, newCourse, parentIdMap);
                }
              }); // end async.eachSeries()
            });
          });
        } else {
          cb(new Error('Could not find course. You probably do not have permissions to copy this course.'));
        }
      });
    },
    function updateStartId(user, newCourse, parentIdMap, cb) {
      // TODO - This is a hack to update the start Id's
      // start Id's should be altered to not use Id's
      if (newCourse && newCourse._id) {
        database.getDatabase(function (error, db) {
          if (error) {
            logger.log('error', error);
            return cb(error);
          }
          var newStartIds = [];
          var incrementVar = 0;
          var newStartObject = _.omit(newCourse._start, '_startIds');
          var startIds = newCourse._start._startIds || [];
          async.eachSeries(startIds, function(startId, next) {
              startId._id = parentIdMap[startId._id];
              newStartIds[incrementVar] = startId;
              incrementVar++;
              next();
          }, function(error) {
            if (error) {
              logger.log('error', error);
              return cb(error);
            } else {
              // update the course with the new or empty start ID's
              newStartObject._startIds = newStartIds
              db.update('course', {_id: newCourse._id}, {_start: newStartObject}, function(err, doc) {
                if (err) {
                  return cb(err);
                }
                cb(null, user, newCourse, parentIdMap);
              });
            }
          });
        }, user._tenantId);
      } else {
        cb("Error - cannot find new course");
      }
    },
    function copyAssets(user, newCourse, parentIdMap, cb) {
      if (!newCourse) {
        return cb("there was an error copying assets");
      }
      if (!user || 'object' !== typeof user) {
        return cb("there was an error copying assets");
      }
      if (!parentIdMap || 'object' !== typeof parentIdMap) {
        return cb("there was an error copying assets");
      }

      database.getDatabase(function (error, db) {
        if (error) {
          logger.log('error', error);
          return cb(error);
        }
        // Assuming there are no errors the assets must set the course assets
        db.retrieve('courseasset', {_courseId: data._id}, {operators: {distinct: '_assetId'}}, function(error, items) {
          if (error) {
            logger.log('error', error);
            return cb(error, newCourse);
          } else {
            async.eachSeries(items, function(item, next) {
              copyAssetToTenant(item, user, function(error, newAssetId) {
                if (error || !newAssetId || 'object' != typeof newAssetId) {
                  var copyError = error || "Error - cannot copy asset to tenant";
                  return cb(copyError);
                }

                parentIdMap[item] = newAssetId._id;
                next();
              });
            }, function(error) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              } else {
                cb(null, user, newCourse, parentIdMap);
              }
            });
          }
        });
      });
    },

    function createCourseAssets(user, newCourse, parentIdMap, cb) {
      database.getDatabase(function (error, db) {
        if (error) {
          logger.log('error', error);
          return cb(error);
        }
        // Assuming there are no errors must set the course assets
        db.retrieve('courseasset', {_courseId: data._id}, function(error, items) {
          if (error) {
            logger.log('error', error);
            cb(error, newCourse);
          } else {
            async.eachSeries(items, function(item, next) {
              if (!item && 'string' !== typeof item._assetId) {
                return next("Asset cannot be found");
              }

              if (parentIdMap[item._contentTypeParentId]) {
                var courseAsset = item.toObject();

                delete courseAsset._id;

                courseAsset._courseId = newCourse._id;
                courseAsset._assetId = parentIdMap[item._assetId];
                courseAsset._contentTypeId = parentIdMap[item._contentTypeId];
                courseAsset._contentTypeParentId = parentIdMap[item._contentTypeParentId];
                courseAsset.createdBy = user._id;

                database.getDatabase(function (error, db) {
                  if (error) {
                    logger.log('error', error);
                    return cb(error);
                  }

                  db.create('courseasset', courseAsset, function (error, newCourseAsset) {
                    if (error) {
                      logger.log('error', error);
                      return next(error);
                    } else {
                      next();
                    }
                  });
                }, user._tenantId);
              } else {
                next();
              }
            }, function(error) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              } else {
                return cb(null, newCourse);
              }
            });
          }
        });
      });
    }
  ], function(error, results) {
    if (error) {
      return cb(error);
    }
    cb(null, results);
  });
};

/**
 * Sort contentObjects into correct creation order.
 * (Parent Menus must be created before child Menus/Pages)
 * @param {array} data
 * @param {callback} cb
 */
function sortContentObjects(data) {
  var flat = {},
      root = [],
      list = [],
      counter = 0;

  // Flatten the data
  for (var i = 0; i < data.length; i++) {
    var key = data[i].get('_id');

    flat[key] = {
      _id: data[i].get('_id'),
      _parentId: data[i].get('_parentId'),
      children: []
    };
  }

  // Populate any 'children' container arrays
  for (var i in flat) {
    var parentkey = flat[i]._parentId;

    if (flat[parentkey]) {
      flat[parentkey].children.push(flat[i]);
    }
  }

  // Find the root nodes (no parent found) and create the hierarchy tree from them
  for (var i in flat) {
    var parentkey = flat[i]._parentId;

    if (!flat[parentkey]) {
      root.push(flat[i]);
    }
  }

  for (var i in root) {
    appendToItems(list, root[i], counter);
  }

  for (var i = 0; i < data.length; i++) {
    data[i]._createOrder = list[data[i].get('_id')]._createOrder;
  }

  // Sort items according to creation order
  data.sort(function(a, b){
    return a._createOrder-b._createOrder;
  });

  return data;
};

/**
 * Recursive append item to list (and set creation order)
 * @param {array} list
 * @param {object} item
 * @param {int} counter
 */
function appendToItems (list, item, counter) {
  counter++;
  item._createOrder = counter;
  list[item._id] = item;

  if (item.children) {
    for (var i in item.children) {
      appendToItems(list, item.children[i], counter);
    }
  }
};

/**
 * TODO - Replace this with call to contentmanager.getContentPlugin('tag'
 * currently contentmanager will only write to the session tenant DB, needs refactor to allow option for tenant DB
 * this is a hack to overcome this
 *
 * Creates duplicate tags in newTenant DB
 * @param {array} tags
 * @param {string} user
 * @param {callback} cb
 */
function createTags (tags, user, cb) {
  var newTags = [];
  if (!user || 'object' !== typeof user) {
    return cb("Error creating tags, no user");
  }

  if (tags && tags.length > 0) {
    database.getDatabase(function (err, db) {
      if (err) {
        return next(err);
      }
      async.eachSeries(tags, function(item, next) {
        if (!item) {
          return next("Tag cannot be found");
        }
        db.retrieve('tag', {title: item.title}, { fields: '_id' }, function(error, tagData) {

          if (error) {
            logger.log('error', error);
            return next("Error finding tags");
          } else {
            // if match then return matching ID otherwise create new tag.
            if (tagData.length == 0) {
              // TODO - not an object - it's an array
              var newTag = {
                title: item.title,
                _isDeleted: false,
                updatedAt: new Date(),
                createdAt: new Date(),
                createdBy: user._id,
                _tenantId: user._tenantId
              }
              var tagDate = new Date();

              db.create('tag', newTag, function (error, newTagId) {

                if (error) {
                  logger.log('error', error);
                  return next(error);
                } else {
                  newTags.push(newTagId);
                  next()
                }
              });
            } else {
              newTags.push(tagData[0]._id);
              next();
            }
          }
        });
      }, function (error) {
          if (error) {
            logger.log('error', error);
            return cb(error);
          }

          cb(null, newTags);
      });
    }, user._tenantId);
  } else {
    cb(null, newTags);
  }
};

// setup course
initialize();

/**
 * Module exports
 *
 */

exports = module.exports = ReplicateCourse;

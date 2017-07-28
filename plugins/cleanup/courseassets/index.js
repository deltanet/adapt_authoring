// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
/**
 * Adapt Output plugin
 */
 var origin = require('../../../');
 var database = require('../../../lib/database');
 var rest = require('../../../lib/rest');
 var configuration = require('../../../lib/configuration');
 var logger = require('../../../lib/logger');
 var helpers = require('../../../lib/helpers');
 var async = require('async');
 var path = require('path');
 var _ = require('underscore');

function CourseAssetClean () {

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
    rest.get('/cleanassets/course/:courseid', function (req, res, next) {
      logger.log('info', 'Assets clean up started');
      var courseId = req.params.courseid;
      var assetsUsedCount = 0;
      var assetsUnusedCount = 0;
      if (!courseId) {
        var errorMessage = 'could not find course';
        logger.log('error', errorMessage);
        return next(errorMessage);
      }

      var courseQuery = { _courseId: courseId };
      database.getDatabase(function (error, db) {
        if (error) {
          return next(error);
        }

        db.retrieve('courseasset', courseQuery, function(error, courseassets) {
          if (error) {
            logger.log('error', error);
            return next(error);
          }

          async.eachSeries(courseassets, function(courseasset, cb) {
            var search = {};
            var contentType;
            // TODO - may want to search by _contentTypeParentId on the parent content type as import did not assign _contentTypeId correctly.
            // this is good for non imported courses
            // need to change the search depending on content type
            switch (courseasset._contentType) {
              case 'page':
              case 'menu':
                contentType = 'contentobject';
                search = {
                  _courseId: courseId,
                  _id: courseasset._contentTypeId
                };
                break;
              case 'course':
                contentType = 'course';
                search = {
                  _id: courseasset._contentTypeId
                };
                break
              default:
                contentType = courseasset._contentType;
                search = {
                  _courseId: courseId,
                  _id: courseasset._contentTypeId
                };
                break;
            }
            isAssetUsed(search, contentType, function(error, assetIsUsed) {
              if (error) {
                logger.log('error', error);
                return cb(error);
              }
              if (!assetIsUsed) {
                assetsUnusedCount++;

                var criteria = _.pick(courseasset, '_id', '_contentTypeId', '_contentType', '_courseId');
                if (criteria && criteria._id) {
                  db.destroy('courseasset', criteria, function (error) {
                    if (error) {
                      return cb(error);
                    }
                    return cb();
                  });
                } else {
                  return cb();
                }
              } else {
                assetsUsedCount++;
                cb();
              }
            });
          }, function(error) {
            if (error) {
              return next(error);
            } else {
              logger.log('info', 'Assets OK: ' + assetsUsedCount);
              logger.log('info', 'Assets cleaned up: ' + assetsUnusedCount);
              logger.log('info', 'Assets clean up finished');
              var resultObject = {
                success: true,
                assetsCleaned: assetsUnusedCount
              };
              res.statusCode = 200;
              return res.json(resultObject);
              //next(null, resultObject);
            }
          });
        });
      });
    });
  });
}

/**
* searches for matching content type record and parses record for asset fieldname
* @param {string} courseId
* @return {object} object containing array of removed assets {  _contentTypeId, _contentTypeParentId, _contentType, _fieldName }
*/
function isAssetUsed(search, contentType, cb) {

  if (!contentType && typeof search === 'object') {
    return cb(error);
  }

  database.getDatabase(function (error, db) {
    if (error) {
      return cb(error);
    }

    db.retrieve(contentType, search, function(error, results) {
      if (error) {
        logger.log('error', error);
        return cb(error, false);
      }

      if (!results || 0 === results.length) {
        return cb(null, false);
      } else {
        return cb(null, true);
      }
    });
  });
}

initialize();

/**
* Module exports
*
*/

exports = module.exports = CourseAssetClean;

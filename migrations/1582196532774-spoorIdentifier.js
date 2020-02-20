const async = require('async');
const helpers = require('./helpers/helper');
const logger = require('../lib/logger');

exports.up = function upFunction(done) {
  helpers.start(({ db }) => {
    db.retrieve('config', {}, (error, configs) => {
      if (error) return done(error);
      let updateCount = 0;

      async.each(configs, (config, callback) => {
        let extensions = config._extensions;
        const spoor = extensions && extensions._spoor;

        if (!spoor) return callback();
        if (!spoor._advancedSettings) return callback();

        let advancedSettings = Object.assign({}, spoor._advancedSettings);

        advancedSettings._timedCommitFrequency = 2;

        if (spoor.identifier !== undefined) {
          advancedSettings._manifestIdentifier = spoor.identifier;
        }

        extensions._spoor._advancedSettings = advancedSettings;
        delete extensions._spoor.identifier;
        updateCount ++;

        db.update('config', { _id: config._id }, {
          _extensions: extensions
        }, callback);
      }, function() {
        logger.log('info', 'Updated ' + updateCount + ' courses.');
        return done();
      });
    });
  });
};

exports.down = function down(done) {
  return done();
}

'use strict';
const async = require('async');
var helpers = require('../helpers/helper');

exports.up = function up(done) {
  helpers.start(({ db }) => {
    db.retrieve('component', { _component: "assessmentResultsAudio" }, (error, components) => {
      if (error) return done(error);
      let updateCount = 0;
      async.eachSeries(components, (component, callback) => {
        if (component._component !== 'assessmentResultsAudio')  return callback();

        let oldRequireAssessmentPassed = component.properties._requireAssessmentPassed;
        let setCompletionOn = 'inview';
        let componentData = component.properties;

        if (oldRequireAssessmentPassed === true) {
          setCompletionOn = 'pass';
        }
        componentData._setCompletionOn = setCompletionOn;
        delete componentData._requireAssessmentPassed;
        updateCount++;
          properties: componentData
        }, callback);

      }, function() {
        console.log('Migration has updated ' + updateCount + ' components');
        return done();
      });
    });
  });
};

exports.down = function down(done) {
  helpers.start(({ db }) => {
    db.retrieve('component', { _component: "assessmentResultsAudio" }, (error, components) => {
      if (error) return done(error);

      async.eachSeries(components, (component, callback) => {
        if (component._component !== 'assessmentResultsAudio') return callback();

        let setCompletionOn = component.properties._setCompletionOn;
        let requireAssessmentPassed = false;
        let componentData = component.properties;

        if (setCompletionOn === 'pass') {
          requireAssessmentPassed = true;
        }

        componentData._requireAssessmentPassed = requireAssessmentPassed;
        delete componentData._setCompletionOn;

        db.update('component', { _id: component._id }, {
          properties: componentData
        }, callback);
      }, done);
    });
  });
};

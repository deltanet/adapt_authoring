define(function(require) {
  var _ = require('underscore');
  var Backbone = require('backbone');
  var Handlebars = require('handlebars');
  var OriginView = require('core/views/originView');
  var Origin = require('core/origin');
  var Helpers = require('core/helpers');


  var TranslateCourseView = OriginView.extend({
    tagName: 'div',
    className: 'translate-course',

    render: function() {
        console.log('translate course view');
      OriginView.prototype.render.apply(this, arguments);

      return this;
    },

  }, {
    template: 'translateCourse'
  });

  return TranslateCourseView;

});

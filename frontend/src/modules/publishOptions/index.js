// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Origin = require('core/origin');
  var PublishOptionsView = require('./views/publishOptionsView.js');
  var PublishOptionsSidebarView = require('./views/publishOptionsSidebarView.js');

  var data = {
    featurePermissions: ["*/*:create","*/*:read","*/*:update","*/*:delete"]
  };

  Origin.on('origin:dataReady login:changed', function() {
    Origin.permissions.addRoute('publishoptions', data.featurePermissions);
  });

  Origin.on('router:publishoptions', function() {
    var route1 = Origin.location.route1;
    Origin.contentPane.setView(PublishOptionsView, { model: new Backbone.Model({ _id: route1 }) });
    Origin.sidebar.addView(new PublishOptionsSidebarView().$el);
  });
});

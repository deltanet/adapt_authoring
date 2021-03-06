// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function (require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');

  var AddTenantSidebarView = SidebarItemView.extend({
    events: {
      'click button.save': 'saveUser',
      'click button.cancel': 'goBack'
    },

    saveUser: function (event) {
      event && event.preventDefault();
      Origin.trigger('tenantManagement:saveTenant');
    },

    goBack: function (event) {
      event && event.preventDefault();
      Origin.router.navigate('#/tenantManagement', { trigger: true });
    }
  }, {
      template: 'addTenantSidebar'
    });
  return AddTenantSidebarView;
});

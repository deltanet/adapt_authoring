define(function(require) {
	var _ = require('underscore');
	var Backbone = require('backbone');
	var Origin = require('core/origin');

	var Translate = Origin.Translate;

	if(!Translate) {
		Translate = Origin.Translate = _.extend({}, Backbone.Events);

		Translate.register = function(name, func) {
			Translate[name] = func;
		};

		loadPLugins();
	}

	// loads the built-in plugins in ./plugins
	function loadPLugins() {
		var translateField = require('./plugins/field/index');
		translateField();
	};

	return Translate;

});

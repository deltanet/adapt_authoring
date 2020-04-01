define(function(require) {
	var _ = require('underscore');
	var Origin = require('core/origin');

  var Field = function(data) {
    // need to check if there is a callback and data
    var isError = null;
    var errorMessage = "";

    if(!data.callback || typeof data.callback !== 'function') {
      isError = true;
      errorMessage = Origin.l10n.t('app.translateError');
    }

    if (!data.text) {
      isError = true;
      errorMessage = Origin.l10n.t('app.translateErrorNoText');
    }

    if (isError) {
      Origin.Notify.alert({
        type: 'error',
        title: 'Error',
        text: Origin.l10n.t('app.translateError') + errorMessage
      });
      return;
    }
    getTranslatedText(data.text, function(error, newText) {
      if (error) {
        Origin.Notify.alert({
          type: 'error',
          text: error.message + Origin.l10n.t('app.translateLangCodeHelp')
        });
        return;
      }
      return data.callback(error, newText);
    });
  }

  var init = function() {
    Origin.Translate.register('field', Field);
  };

  function getTranslatedText(text, cb) {
    let translateTo = Origin.editor.data.config.get('_defaultLanguage');
    var formText = {
      text: text,
      to: translateTo
    }
    $.ajax({
      type: 'POST',
      url: 'api/translate/text',
      data: formText,
      success: function (data, textStatus, jqXHR) {
        cb(null, data);
      },
      error: function(jqXHR, textStatus, errorThrown) {
        var xhrError = jqXHR.responseJSON;
        return cb(xhrError);
      }
    });
  }

  return init;

});

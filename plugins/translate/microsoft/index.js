// external
const request = require('request');
const uuidv4 = require('uuid/v4');
const util = require('util');

// internal
const TranslationManager = require('../../../lib/translationmanager')
const TranslationPlugin = TranslationManager.TranslationPlugin;
const TranslationError = TranslationManager.errors.TranslationError;
const TranslationPermissionError = TranslationManager.errors.TranslationPermissionError;
const logger = require('../../../lib/logger');
const origin = require('../../../');
const rest = require('../../../lib/rest');
const configuration = require('../../../lib/configuration');
//debugger;
/**
 * Adapt Output plugin
 */
function MicrosoftTranslate() {
}
util.inherits(MicrosoftTranslate, TranslationPlugin);

const translateServiceEndpoint = getEndPoint();
const translateServiceKey = getKey();

/**
 * essential setup
 *
 * @api private
 */
function initialize () {
  var self = this;
  var app = origin();
  app.once('serverStarted', function(server) {
    /**
     * API Endpoint to translate text
     */
    rest.post('/translate', function (req, res, next) {
      translate(req, res, function(error, response, body) {
        if (error) {
          logger.log('error', error);
          return res.status(500).json(error);
        }
        if (typeof body !== 'object') {
          logger.log('error', 'Translation Text error, response body is not an object: ' + JSON.stingify(body));
          return res.status(500).json({ success:false });
        }
        if (body.error) {
          logger.log('error', 'Translation Text error: ' + body.error);
          return res.status(500).json({ success:false, message: body.error });
        }
        // return the translated text.
        // response will be an array, what should be done for multiple entries
        if (body.length && body.length > 0) {
          var translationsArray = body[0].translations;
          if (translationsArray.length && translationsArray.length > 0) {
            return res.status(200).json(translationsArray[0].text);
          } else {
            return res.status(404).json({ success:false });
          }
        } else {
          return res.status(404).json({ success:false });
        }
      });
    });
  });
}



MicrosoftTranslate.prototype.translateText = function (id, text, req, res, next) {
  logger.log('info', 'Translating: ' + text);
};

function translate(req, res, cb) {
  let origText = req.body.text;
  let toLang = req.body.to;
  let options = {
    method: 'POST',
    baseUrl: translateServiceEndpoint,
    url: 'translate',
    qs: {
      'api-version': '3.0',
      'to': [toLang]
    },
    headers: {
      'Ocp-Apim-Subscription-Key': translateServiceKey,
      'Content-type': 'application/json',
      'X-ClientTraceId': uuidv4().toString()
    },
    body: [{
          'text': origText
    }],
    json: true,
  };

  request(options, function(error, response, body) {
    return cb(error, response, body);
  });
}

function getEndPoint() {
  var endpoint = configuration.getConfig('microsoftTranslateEndpoint');
  if (!endpoint) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateEndpoint');
  }
  return endpoint;
}

function getKey() {
  var subscriptionKey = configuration.getConfig('microsoftTranslateKey');
  if (!subscriptionKey) {
      return new TranslationError('Please set/export the following environment variable: microsoftTranslateKey');
  }
  return subscriptionKey;
}


// setup translate
initialize();

// module exports
exports = module.exports = MicrosoftTranslate;

// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
var builder = require('./lib/application');
console.log('USING PORT', process.env.PORT);
var app = builder();
app.run();

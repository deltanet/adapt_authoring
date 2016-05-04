var app = require('./lib/application')();
var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs-extra');
var glob = require('glob');
var semver = require('semver');

var config = require('./conf/config.json');

var FRAMEWORK_DIR = 'temp/' + config.masterTenantID + '/adapt_framework';
var AUTO_RETRIES = 5;

app.run({
  skipVersionCheck: true,
  skipStartLog: true
});

app.on('serverStarted', init);

function init() {
  cleanPlugins(function(error) {
    if(error) return exitUpgrade(error);
    upgrade(exitUpgrade);
  });
}

function cleanPlugins(cb) {
  console.log('Cleaning plugin directories...');
  var pluginDirs = [
    'components',
    'extensions',
    'theme',
    'menu'
  ];
  async.each(pluginDirs, function(dir, done) {
    fs.remove(FRAMEWORK_DIR + '/src/' + dir, done);
  }, function(error) {
    if(error) return cb(error);
    console.log('  Plugin directories cleaned.');
    cb();
  });
}

function upgrade(cb) {
  console.log('Starting upgrade');
  getLatestGitVersion(FRAMEWORK_DIR, function(error, latestFrameworkVersion) {
    if(error) return exitUpgrade(error);
    console.log('Attempting to upgrade framework to', latestFrameworkVersion + '...');
    var opts = {
      cwd: FRAMEWORK_DIR,
      stdio: [0, 'pipe', 'pipe']
    };
    var child = exec('git reset --hard ' + latestFrameworkVersion + ' && npm install', opts);
    child.on('exit', function (error, stdout, stderr) {
      if (error) return exitUpgrade(error);
      fs.remove(FRAMEWORK_DIR + '/src/course', function(error) {
        console.log('  Successfully upgraded framework.');
        console.log('Attempting to upgrade plugins...');
        var child = exec('adapt install', opts);
        child.on('exit', function (error, stdout, stderr) {
          if (error) {
            if(AUTO_RETRIES > 0) {
              AUTO_RETRIES--;
              console.log('Plugin upgrade failed. Reattempting...');
              setTimeout(init, 1000);
            } else {
              return exitUpgrade(error);
            }
          }
          console.log('  Successfully upgraded plugins.');
          cb();
        });
      });
    });
  });
}

function getLatestGitVersion(dir, callback) {
  var opts = {
    cwd: dir,
    stdio: [0, 'pipe', 'pipe']
  };
  var c1 = exec('git fetch --tags origin', opts);
  c1.stdout.on('data', console.log);
  c1.on('exit', function (error, stdout, stderr) {
    if (error) return callback(error);
    var tags = "";
    var c2 = exec('git tag', opts);
    c2.stdout.on('data', function(data) {
      tags += data;
    });
    c2.stderr.on('data', console.log);
    c2.on('exit', function (error) {
      if (error) return callback(error);
      var tagsArr = tags.split('\n');
      callback(null, tagsArr[tagsArr.length-2]);
    });
  });
}

function exitUpgrade(error, code) {
  console.log(error || 'Framework upgraded successfully!');
  process.exit(code || 0);
}

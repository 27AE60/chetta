'use strict';

var fs = require('fs'),
  path = require('path'),
  lodash = require('lodash'),
  gutil = require('gulp-util'),
  gulp = require('gulp'),
  net = require('net'),
  connect = require('gulp-connect'),
  compile = require('./compile.js'),
  config = require('../app.json').components;

var baseDir = path.resolve(__dirname, '../');

var Component = function() {};

Component.prototype.add = function(_component) {
  var _componentPath = path.join(path.join(baseDir, config.basePath), _component);

  try {
    fs.mkdirSync(_componentPath);
  } catch (e) {
    if (e.code == 'EEXIST') {
      gutil.log(gutil.colors.red(_component + ' exits in ' + config.basePath));
    } else {
      gutil.log(gutil.colors.red(_component + ' couldn\'t be added ', e));
    }
    return;
  }

  config.tpl.folders.forEach(function(foldername) {
    fs.mkdirSync(path.join(_componentPath, foldername));
  });

  config.tpl.files.forEach(function(file) {
    var _path = path.join(_componentPath, file.path);

    var filename = (file.name ? file.name : _component) + '.' + file.type;

    var template = fs.readFileSync(path.join(__dirname, file.content), 'utf8');
    fs.writeFile(
      path.join(_path, filename),
      lodash.template(template)({
        name: _component.charAt(0).toUpperCase() + _component.slice(1),
        author: 'Reactive'
      }),
      function(e) {
        if (e) {
          gutil.log(e);
        }
      }
    );
  });
};

Component.prototype.remove = function(_component) {
  var _componentPath = path.join(path.join(baseDir, config.basePath), _component);
  try {
    rmdir(_componentPath);
  } catch (e) {
    if (e.code != 'EEXIST') {
      console.error(_component + ' doesn\'t exist at ' + config.basePath);
      return;
    }
  }

  console.log(_component + ' removed.');
};

Component.prototype.info = function(_component) {
  var _componentPath = path.join(path.join(baseDir, config.basePath), _component);
  try {
    var _jsonFile = fs.readFileSync(path.join(_componentPath, 'component.json'), 'utf8');
  } catch (e) {
    if (e.code != 'EEXIST') {
      console.error(_component + ' doesn\'t exist in ' + config.basePath);
      return;
    }
  }

  console.log(_jsonFile);
};

Component.prototype.watch = function(_component) {
  var _baseDir = path.join(baseDir, config.basePath),
    _componentDir = path.join(_baseDir, _component),
    _tempDir = path.join(baseDir, config.tempDir),
    _tempComponentDir = path.join(_tempDir, _component);

  try {
    var _depMap = {};
    getDep(_baseDir, _component, _depMap);
  } catch (e) {
    gutil.log(gutil.colors.red(_component + ' watch failed.', e));
    return;
  }

  try {
    fs.mkdirSync(path.join(baseDir + '/.tmp'));
  } catch (e) {
    if (e.code != 'EEXIST') {
      gutil.log(gutil.colors.red(_component + ' watch failed.', e));
      return;
    }
  }

  try {
    fs.mkdirSync(_tempDir);
  } catch (e) {
    if (e.code != 'EEXIST') {
      gutil.log(gutil.colors.red(_component + ' watch failed.', e));
      return;
    }
  }

  try {
    rmdir(_tempComponentDir);
  } catch (e) {
    if (e.code != 'ENOENT') {
      gutil.log(gutil.colors.red(_component + ' watch failed.', e));
      return;
    }
  }

  try {
    fs.mkdirSync(_tempComponentDir);
    fs.mkdirSync(path.join(_tempComponentDir, 'css'));
    fs.mkdirSync(path.join(_tempComponentDir, 'scripts'));
  } catch (e) {
    gutil.log(gutil.colors.red(_component + ' watch failed.', e));
    return;
  }

  // Get components
  var _deps = Object.keys(_depMap);

  // extract dependencies
  var _jsxDeps = [],
    _importSass = [],
    _importJsx = [],
    _sassDeps = [];

  var _tempSass = [],
    _tempJsx = [];

  _deps.forEach(function(_dep) {
    _jsxDeps.push(path.join(_baseDir, _dep, '/src/jsx/*.jsx'), path.join(_baseDir, _dep, '/src/jsx/*.js'));
    _sassDeps.push(path.join(_baseDir, _dep, '/src/*.scss'), path.join(_baseDir, _dep, '/src/*.css'));
    _tempSass = lodash.uniq(_tempSass.concat(_depMap[_dep].extSass));
    _tempJsx = lodash.uniq(_tempJsx.concat(_depMap[_dep].extJsx));
  });

  _tempSass.forEach(function(_path) {
    _path = path.join(_componentDir, _path);
    _importSass.push(path.join(_path, '/*.scss'), path.join(_path, '/*.css'));
  });

  _tempJsx.forEach(function(_path) {
    _path = path.join(_componentDir, _path);
    _importJsx.push(path.join(_path, '/*.jsx'), path.join(_path, '/*.js'));
  });

  gulp.task('compile-sass', function() {
    return compile.sass({
      sources: _sassDeps.concat(_importSass),
      destination: path.join(_tempComponentDir, 'css')
    });
  });

  gulp.task('compile-jade', function() {
    return compile.jade({
      source: path.join(_componentDir, 'src/*.jade'),
      destination: _tempComponentDir
    });
  });

  /* Note: Here we compile only trigger.jsx because trigger is only used for
   * development phase which actually includes the component */
  gulp.task('compile-jsx', function() {
    return compile.jsx({
      source: path.join(_componentDir, 'src/jsx', 'trigger.jsx'),
      destination: path.join(_tempComponentDir, 'scripts')
    }, 'trigger');
  });

  gulp.task('watch', function() {
    // Watch current component jade
    gulp.watch([path.join(_componentDir, '/src/*.jade')], ['compile-jade']);

    // Watch current and dependency component jsx
    gulp.watch(_jsxDeps, ['compile-jsx']);

    // Watch current and dependency component sass
    gulp.watch(_sassDeps, ['compile-sass']);

    // Watch external js & jsx
    gulp.watch(_importJsx, ['compile-jsx']);

    // Watch external sass
    gulp.watch(_importSass, ['compile-sass']);
  });

  gulp.task('connect', function() {
    getPort(9000, function(port) {
      connect.server({
        root: _tempComponentDir,
        port: port,
        livereload: true
      });
      gutil.log(gutil.colors.green('Watching component - ' + _component));
    });
  });

  gulp.start('compile-sass', 'compile-jade', 'compile-jsx', 'watch', 'connect');
};

Component.prototype.test = function(_component) {};

Component.prototype.coverage = function(_component) {};

// Get free port
var getPort = function(port, cb) {
  var server = net.createServer();
  server.listen(port, function(err) {
    server.once('close', function() {
      cb(port);
    });
    server.close();
  });
  server.on('error', function(err) {
    getPort(port + 1, cb);
  });
};

// Recursive dependency check
var getDep = function(_baseDir, _component, _depMap) {
  var _jsonFile = fs.readFileSync(path.join(_baseDir, _component, 'component.json'), 'utf8');
  var _componentInfo = JSON.parse(_jsonFile);
  _depMap[_component] = _componentInfo.dependencies;
  for (var i = 0; i < _componentInfo.dependencies.components.length; i++) {
    if (!_depMap[_componentInfo.dependencies.components[i]]) {
      getDep(_baseDir, _componentInfo.dependencies.components[i], _depMap);
    }
  }
};

// Recursive directory remove
var rmdir = function(dir) {
  var list = fs.readdirSync(dir);
  for (var i = 0; i < list.length; i++) {
    var filename = path.join(dir, list[i]);
    var stat = fs.statSync(filename);

    if (filename == '.' || filename == '..') {
      // pass these files
    } else if (stat.isDirectory()) {
      // rmdir recursively
      rmdir(filename);
    } else {
      // rm fiilename
      fs.unlinkSync(filename);
    }
  }
  fs.rmdirSync(dir);
};

module.exports = Component;
var gulp = require('gulp');
var args = require('yargs').argv;
var browserSync = require('browser-sync');
var del = require('del');
var config = require('./gulp.config')();
var $ = require('gulp-load-plugins')({
    lazy: true
});
var port = process.env.PORT || config.defaultPort;

gulp.task('help', $.taskListing);

gulp.task('default', ['help']);

gulp.task('vet', function () {
    'use strict';
    log('Analyzing source with JSCS and JSHint');

    return gulp
        .src(config.alljs)
        .pipe($.if(args.verbose, $.print()))
        .pipe($.jscs())
        .pipe($.jshint())
        .pipe($.jshint.reporter('jshint-stylish', {
            verbose: true
        }))
        .pipe($.jshint.reporter('fail'));
});

gulp.task('styles', ['clean-styles'], function () {
    log('Compiling Less --> CSS');

    return gulp
        .src(config.less)
        .pipe($.plumber())
        .pipe($.less())
        .pipe($.autoprefixer({
            browsers: ['last 2 version', '> 5%']
        }))
        .pipe(gulp.dest(config.temp));
});

gulp.task('fonts', ['clean-fonts'], function () {
    log('Copying fonts');

    return gulp
        .src(config.fonts)
        .pipe(gulp.dest(config.build + 'fonts'));
});

gulp.task('images', ['clean-images'], function () {
    log('Copying and compressing images');

    return gulp
        .src(config.images)
        .pipe($.imagemin({
            optimizationLevel: 4
        }))
        .pipe(gulp.dest(config.build + 'images'));
});

// Does not have a stream, so should use a callback
gulp.task('clean', function (done) {
    var delconfig = [].concat(config.build, config.temp);
    log('Cleaning: ' + $.util.colors.blue(delconfig));
    del(delconfig, done);
});

// Does not have a stream, so should use a callback
gulp.task('clean-fonts', function (done) {
    clean(config.build + 'fonts/**/*.*', done);
});

// Does not have a stream, so should use a callback
gulp.task('clean-images', function (done) {
    clean(config.build + 'images/**/*.*', done);
});

// Does not have a stream, so should use a callback
gulp.task('clean-styles', function (done) {
    clean(config.temp + '**/*.css', done);
});

// Does not have a stream, so should use a callback
gulp.task('clean-code', function (done) {
    var files = [].concat(
        config.temp + '**/*.js',
        config.build + '**/*.html',
        config.build + 'js/**/*.js'
    );
    clean(files, done);
});

gulp.task('less-watcher', function () {
    gulp.watch([config.less], ['styles']);
});

gulp.task('templatecache', function () {
    log('Creating AngularJS $templateCache');

    return gulp
        .src(config.htmltemplates)
        .pipe($.minifyHtml({empty: true}))
        .pipe($.angularTemplatecache(config.templateCache.file, config.templateCache.options))
        .pipe(gulp.dest(config.temp));
});

gulp.task('wiredep', function () {
    log('Wiring up the Bower dependencies into the html');

    var options = config.getWiredepDefaultOptions();
    var wiredep = require('wiredep').stream;

    return gulp
        .src(config.index)
        .pipe(wiredep(options)) // bower dependencies
        .pipe($.inject(gulp.src(config.js))) // our custom dependencies
        .pipe(gulp.dest(config.client));
});

gulp.task('inject', ['wiredep', 'styles', 'templatecache'], function () {
    log('Wiring up app dependencies into the html, after wiredep and styles have run');

    var options = config.getWiredepDefaultOptions();
    var wiredep = require('wiredep').stream;

    return gulp
        .src(config.index)
        .pipe($.inject(gulp.src(config.css)))
        .pipe(gulp.dest(config.client));
});

gulp.task('optimize', ['inject', 'fonts', 'images'], function () {
    log('Optimizing javascript, css and html files');

	var assets = $.useref.assets({searchPath: './'});
	var templateCache = config.temp + config.templateCache.file;
	var cssFilter = $.filter('**/*.css');
	var jsLibFilter = $.filter('**/' + config.optimized.lib);
	var jsAppFilter = $.filter('**/' + config.optimized.app);

    return gulp
        .src(config.index)
        .pipe($.plumber())
        .pipe($.inject(gulp.src(templateCache, {read: false}), {
			starttag: '<!-- inject:templates:js -->'
		}))
		.pipe(assets)

		.pipe(cssFilter)
		.pipe($.csso())
		.pipe(cssFilter.restore())

		.pipe(jsLibFilter)
		.pipe($.uglify())
		.pipe(jsLibFilter.restore())

		.pipe(jsAppFilter)
		.pipe($.ngAnnotate())
		.pipe($.uglify())
		.pipe(jsAppFilter.restore())

		.pipe(assets.restore())
		.pipe($.useref())
        .pipe(gulp.dest(config.build));
});

gulp.task('serve-build', ['optimize'], function () {
	serve(false);
});

gulp.task('serve-dev', ['inject'], function () {
	serve(true);
});

//////////////////////////
//   Helper functions   //
//////////////////////////

function serve(isDev) {
    var nodeOptions = {
        script: config.nodeServer,
        delayTime: 1,
        env: {
            'PORT': port,
            'NODE_ENV': isDev ? 'dev' : 'build'
        },
        watch: [config.server]
    };

    return $.nodemon(nodeOptions)
        .on('restart', ['vet'], function (ev) {
            log('*** nodemon restarted ***');
            log('files changed on restart:\n' + ev);
            setTimeout(function () {
                browserSync.notify('reloading now ...');
                browserSync.reload({
                    stream: false
                });
            }, config.browserReloadDelay);
        })
        .on('start', function () {
            log('*** nodemon started ***');
            startBrowserSync(isDev);
        })
        .on('crash', function () {
            log('*** nodemon crashed: script crashed fr some reason ***');
        })
        .on('exit', function () {
            log('*** nodemon exited cleanly ***');
        });
}

function changeEvent(event) {
    var srcPattern = new RegExp('/.*(?=/' + config.source + ')/');

    log('File ' + event.path.replace(srcPattern, '') + ' ' + event.type);
}

function startBrowserSync(isDev) {
    if (args.nosync || browserSync.active) {
        return;
    }

    log('Starting browser-sync on port ' + port);

	if (isDev) {
		gulp.watch([config.less], ['styles']).on('change', function (ev) {
            changeEvent(ev);
        });
	} else {
		gulp.watch([config.less, config.js, config.html], ['optimize', browserSync.reload]).on('change', function (ev) {
            changeEvent(ev);
        });
	}

    var options = {
        proxy: 'localhost:' + port,
        port: 3000,
        files: isDev ? [
            config.client + '**/*.*',
            '!' + config.less,
            config.temp + '**/*.css'
        ] : [],
        ghostMode: {
            clicks: true,
            location: false,
            forms: true,
            scroll: true
        },
        injectChanges: true, // CSS
        logFileChanges: true,
        logLevel: 'debug',
        logPrefix: 'gulp-patterns',
        notify: true,
        reloadDelay: 1000
    };

    browserSync(options);
}

function clean(path, done) {
    log('Cleaning: ' + $.util.colors.blue(path));
    del(path, done);
}

function log(msg) {
    'use strict';
    var item;
    if (typeof (msg) === 'object') {
        for (item in msg) {
            if (msg.hasOwnProperty(item)) {
                $.util.log($.util.colors.blue(msg[item]));
            }
        }
    } else {
        $.util.log($.util.colors.blue(msg));
    }
}

//function errorLogger(error) {
//    log('*** Start of Error ***');
//    log(error);
//    log('*** End of Error ***');
//
//    // Use Gulps' emit to end the pipeline!
//    this.emit('end');
//}

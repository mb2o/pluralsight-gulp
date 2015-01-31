var gulp = require('gulp');
var args = require('yargs').argv;
var del = require('del');

var config = require('./gulp.config')();

var $ = require('gulp-load-plugins')({
    lazy: true
});

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

// Does not have a stream, so should use a callback
gulp.task('clean-styles', function (done) {
    var files = config.temp + '**/*.css';

    clean(files, done);
});

gulp.task('less-watcher', function () {
    gulp.watch([config.less], ['styles']);
});

/////////////////////

//function errorLogger(error) {
//    log('*** Start of Error ***');
//    log(error);
//    log('*** End of Error ***');
//
//    // Use Gulps' emit to end the pipeline!
//    this.emit('end');
//}

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

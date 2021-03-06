/* eslint-env node, mocha */
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');
var exec = require('child_process').exec;
var execFile = require('child_process').execFile;
var assert = require('chai').assert;
var mockery = require('mockery');
var readJson = require('read-package-json');
var nn = require('normalize-newline');
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');

process.chdir(path.resolve(__dirname));
process.setMaxListeners(0);

describe('CLI', function () {
    beforeEach(function (done) {
        readJson('../package.json', function (err, data) {
            assert.isNull(err, Boolean(err) && err);
            this.pkg = data;
            done();
        }.bind(this));
    });

    after(function () {
        process.emit('cleanup');
    });

    describe('acceptance', function () {
        it('should return the version', function (done) {
            execFile('node', [path.join(__dirname, '../', this.pkg.bin.critical), '--version', '--no-update-notifier'], function (error, stdout) {
                assert.strictEqual(stdout.replace(/\r\n|\n/g, ''), this.pkg.version);
                done();
            }.bind(this));
        });

        it('should work well with the html file passed as an option', function (done) {
            var cp = execFile('node', [
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--base', 'fixtures',
                '--width', '1300',
                '--height', '900'
            ]);

            var expected = fs.readFileSync(path.join(__dirname, 'expected/generate-default.css'), 'utf8');
            cp.stdout.on('data', function (data) {
                if (data instanceof Buffer) {
                    data = data.toString('utf8');
                }
                assert.strictEqual(nn(data), nn(expected));
                done();
            });
        });

        it('should work well with the critical CSS file piped to critical', function (done) {
            var cmd;

            if (process.platform === 'win32') {
                cmd = 'type';
            } else {
                cmd = 'cat';
            }

            cmd += ' ' + path.normalize('fixtures/generate-default.html') + ' | node ' + path.join(__dirname, '../', this.pkg.bin.critical) + ' --base fixtures --width 1300 --height 900';

            var cp = exec(cmd);

            var expected = fs.readFileSync(path.join(__dirname, 'expected/generate-default.css'), 'utf8');
            cp.stdout.on('data', function (data) {
                if (data instanceof Buffer) {
                    data = data.toString('utf8');
                }
                assert.strictEqual(nn(data), nn(expected));
                done();
            });
        });

        it('should work well with the html file inside a folder piped to critical', function (done) {
            var cmd = 'cat fixtures/folder/generate-default.html | node ' + path.join(__dirname, '../', this.pkg.bin.critical) + ' --base fixtures --width 1300 --height 900';
            var expected = fs.readFileSync(path.join(__dirname, 'expected/generate-default.css'), 'utf8');

            exec(cmd, function (error, stdout) {
                assert.isNull(error);
                assert.strictEqual(nn(stdout.toString('utf8')), nn(expected));
                done();
            });
        });

        it('should show warning on piped file without relative links and use "/"', function (done) {
            var cmd = 'cat fixtures/folder/subfolder/generate-image-absolute.html | node ' + path.join(__dirname, '../', this.pkg.bin.critical) + ' --base fixtures --width 1300 --height 900';
            var expected = fs.readFileSync(path.join(__dirname, 'expected/generate-image-absolute.css'), 'utf8');

            exec(cmd, function (error, stdout, stderr) {
                assert.isNull(error);
                assert.strictEqual(nn(stdout.toString('utf8')), nn(expected));
                assert.include(stderr.toString('utf8'), 'Missing html source path. Consider \'folder\' option.');
                done();
            });
        });

        it('should exit with code 1 and show help', function (done) {
            execFile('node', [path.join(__dirname, '../', this.pkg.bin.critical), 'fixtures/not-exists.html'], function (err, stdout, stderr) {
                assert.typeOf(err, 'Error');
                assert.strictEqual(err.code, 1);
                assert.include(stderr, 'Usage:');
                done();
            });
        });
    });

    describe('acceptance (remote)', function () {
        var server;

        before(function () {
            var serve = serveStatic('fixtures', {index: ['generate-default.html']});

            server = http.createServer(function (req, res) {
                var done = finalhandler(req, res);
                serve(req, res, done);
            });
            server.listen(3000);
        });

        after(function () {
            server.close();
        });

        it('should generate critical path css from external resource', function (done) {
            var cp = execFile('node', [
                path.join(__dirname, '../', this.pkg.bin.critical),
                'http://localhost:3000',
                '--base', 'fixtures',
                '--width', '1300',
                '--height', '900'
            ]);

            var expected = fs.readFileSync(path.join(__dirname, 'expected/generate-default.css'), 'utf8');
            cp.stdout.on('data', function (data) {
                if (data instanceof Buffer) {
                    data = data.toString('utf8');
                }
                assert.strictEqual(nn(data), nn(expected));
                done();
            });
        });
    });

    describe('mocked', function () {
        beforeEach(function () {
            this.origArgv = process.argv;
            this.origExit = process.exit;

            mockery.enable({
                warnOnUnregistered: false,
                useCleanCache: true
            });

            mockery.registerMock('./', {
                generate: function (opts) {
                    this.mockOpts = opts;
                    this.method = 'generate';
                }.bind(this),
                generateInline: function (opts) {
                    this.mockOpts = opts;
                    this.method = 'generateInline';
                }.bind(this)
            });
        });

        afterEach(function () {
            mockery.deregisterAll();
            mockery.disable();
            process.argv = this.origArgv;
            process.exit = this.origExit;
        });

        it('should pass the correct opts when using short opts', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '-c', 'css',
                '-w', '300',
                '-h', '400',
                '-H', 'htmlTarget',
                '-S', 'styleTarget',
                '-m', 'minify',
                '-e', 'extract',
                '-f', 'folder',
                '-p', 'pathPrefix',
                '-i'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.mockOpts.width, 300);
            assert.strictEqual(this.mockOpts.height, 400);
            assert.strictEqual(this.mockOpts.css, 'css');
            assert.strictEqual(this.mockOpts.htmlTarget, 'htmlTarget');
            assert.strictEqual(this.mockOpts.styleTarget, 'styleTarget');
            assert.strictEqual(this.mockOpts.minify, 'minify');
            assert.strictEqual(this.mockOpts.extract, 'extract');
            assert.strictEqual(this.mockOpts.pathPrefix, 'pathPrefix');
            assert.strictEqual(this.mockOpts.folder, 'folder');
            assert.strictEqual(this.mockOpts.inline, true);
        });

        it('should pass the correct opts when using long opts', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--css', 'css',
                '--width', '300',
                '--height', '400',
                '--ignore', 'ignore',
                '--include', '/include/',
                '--htmlTarget', 'htmlTarget',
                '--styleTarget', 'styleTarget',
                '--minify', 'minify',
                '--extract', 'extract',
                '--folder', 'folder',
                '--pathPrefix', 'pathPrefix',
                '--inline',
                '--inlineImages',
                '--maxFileSize', '1024',
                '--assetPaths', 'assetPath1',
                '--assetPaths', 'assetPath2'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.mockOpts.width, 300);
            assert.strictEqual(this.mockOpts.height, 400);
            assert.strictEqual(this.mockOpts.css, 'css');
            assert.strictEqual(this.mockOpts.htmlTarget, 'htmlTarget');
            assert.strictEqual(this.mockOpts.styleTarget, 'styleTarget');
            assert.strictEqual(this.mockOpts.minify, 'minify');
            assert.strictEqual(this.mockOpts.extract, 'extract');
            assert.strictEqual(this.mockOpts.folder, 'folder');
            assert.strictEqual(this.mockOpts.pathPrefix, 'pathPrefix');
            assert.isArray(this.mockOpts.ignore);
            assert.include(this.mockOpts.ignore, 'ignore');
            assert.isArray(this.mockOpts.include);
            assert.instanceOf(this.mockOpts.include[0], RegExp);
            assert.strictEqual(this.mockOpts.inline, true);
            assert.strictEqual(this.mockOpts.inlineImages, true);
            assert.isArray(this.mockOpts.assetPaths);
            assert.include(this.mockOpts.assetPaths, 'assetPath1');
            assert.include(this.mockOpts.assetPaths, 'assetPath2');
            assert.strictEqual(this.mockOpts.maxFileSize, 1024);
        });

        it('should set inline to false when prefixed with --no', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--no-inline'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.mockOpts.inline, false);
        });

        it('should set inline to false when passing a falsy value', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '-i', '0'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.mockOpts.inline, false);
        });

        it('should use "generateInline" when passing htmltarget', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--htmlTarget', 'htmlTarget'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generateInline');
        });

        it('should use "generate" when not passing htmltarget', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generate');
        });

        it('should use "generateInline" when passing --inline', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--inline', 'htmlTarget'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generateInline');
        });

        it('should use "generate" when not passing --inline', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generate');
        });

        it('should use "generate" when not passing falsy value for --inline', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--inline', false
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generate');
        });

        it('should rewrite "styleTarget" to "dest" when using "generate"', function () {
            process.argv = [
                'node',
                path.join(__dirname, '../', this.pkg.bin.critical),
                'fixtures/generate-default.html',
                '--styleTarget', 'styleTarget'
            ];

            require('../cli'); // eslint-disable-line import/no-unassigned-import

            assert.strictEqual(this.method, 'generate');
            assert.strictEqual(this.mockOpts.dest, 'styleTarget');
        });
    });
});

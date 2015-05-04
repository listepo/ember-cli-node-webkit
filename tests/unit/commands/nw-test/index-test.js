'use strict';

var fs            = require('fs');
var path          = require('path');
var RSVP          = require('rsvp');
var sinon         = require('sinon');
var Command       = require('ember-cli/lib/models/command');
var Task          = require('ember-cli/lib/models/task');
var TestTask      = require('ember-cli/lib/tasks/test');
var MockUI        = require('ember-cli/tests/helpers/mock-ui');
var MockAnalytics = require('ember-cli/tests/helpers/mock-analytics');
var MockProject   = require('../../../helpers/mocks/project');
var expect        = require('../../../helpers/expect');

var Command = require('ember-cli/lib/models/command');

describe('ember nw:test command', function() {
  var CommandUnderTest, commandOptions, tasks, outputPath;

  beforeEach(function() {
    var cmd = require('../../../../lib/commands/nw-test');
    CommandUnderTest = Command.extend(cmd);

    commandOptions = {
      ui: new MockUI(),
      analytics: new MockAnalytics(),
      settings: {},
      project: new MockProject('project-with-test-config'),

      tasks: {
        Build: Task.extend({
          run: function(options) {
            outputPath = options.outputPath;

            var fixturePath = path.join(__dirname, '../../../fixtures');
            var baseIndex = path.join(fixturePath, 'project-with-test-config', 'tests', 'index.html');

            var testsDir = path.join(outputPath, 'tests');
            var testsIndex = path.join(testsDir, 'index.html');

            fs.mkdirSync(testsDir, 0x1ff);

            var indexContent = fs.readFileSync(baseIndex, { encoding: 'utf8' });
            fs.writeFileSync(testsIndex, indexContent);

            tasks.push('build');
            return RSVP.resolve();
          }
        }),

        Test: Task.extend({
          run: function(options) {
            tasks.push('test');
            return RSVP.resolve();
          }
        })
      }
    };

    tasks = [];
  });

  it('should build the project before running tests', function() {
    var command = new CommandUnderTest(commandOptions).validateAndRun();

    return expect(command).to.be.fulfilled
      .then(function() {
        expect(tasks).to.deep.equal(['build', 'test']);
      });
  });

  describe('when preparing test files', function() {
    it('should update the base href for the test runner page', function() {
      var indexContent;

      commandOptions.runTests = function(options) {
        var indexPath = path.join(options.outputPath, 'tests', 'index.html');
        indexContent = fs.readFileSync(indexPath, { encoding: 'utf8' });

        return RSVP.resolve();
      };

      var command = new CommandUnderTest(commandOptions).validateAndRun();

      return expect(command).to.be.fulfilled
        .then(function() {
          expect(indexContent).to.contain('base href="../"');
        });
    });

    it('should copy package.json to the tests output directory', function() {
      var fileExists;

      commandOptions.runTests = function(options) {
        var packageJSON = path.join(options.outputPath, 'tests', 'package.json');
        fileExists = fs.existsSync(packageJSON);

        return RSVP.resolve();
      };

      var command = new CommandUnderTest(commandOptions).validateAndRun();

      return expect(command).to.be.fulfilled
        .then(function() {
          expect(fileExists).to.be.true;
        });
    });
  });

  it('should call the Test task with the correct options', function() {
    var testem, testOptions;

    commandOptions.tasks.Test = TestTask.extend({
      init: function(options) {
        var Testem = require('testem');
        testem = this.testem = new Testem();

        sinon.stub(this.testem, 'startCI', function(options, callback) {
          this.app = {
            reporter: { total: 10 }
          };
          testOptions = options;
          callback();
        });
      }
    });

    var command = new CommandUnderTest(commandOptions).validateAndRun();

    return expect(command).to.be.fulfilled
      .then(function() {
        var launcherName = 'NW.js';
        expect(testOptions.cwd).to.equal(outputPath);
        expect(testOptions['launch_in_ci']).to.deep.equal([launcherName]);
        expect(testOptions['launch_in_dev']).to.deep.equal([launcherName]);

        var launcher = testOptions.launchers[launcherName] || {};
        expect(launcher.protocol).to.equal('tap');

        var runnerPath = require.resolve('../../../../lib/commands/nw-test/runner');
        expect(launcher.command).to.equal('node "' + runnerPath + '" --nw-path="nw" --tests-path="' + path.join(outputPath, 'tests') + '"');

        testem.startCI.restore();
      });
  });
});

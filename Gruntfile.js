/* jshint forin:false */
/* eslint-disable no-useless-escape */

const fs = require('fs');
const path = require('path');
const nunjucks = require('nunjucks');
const marked = require('marked');
const docco = require('docco');

const vars = {
  enableExample: false,
  enableHome: false,
  GA_ACCOUNT: 'UA-35433268-28',
  base: ''
};

const TESTDIR = 'test-build';

module.exports = function (grunt) {
  if (!grunt.option('dest')) {
    grunt.option('dest', 'build');
  }

  let dumpLineNumbers = false;
  if (grunt.option('less-line-numbers')) {
    grunt.verbose.writeln('Enabling LESS line numbers');
    dumpLineNumbers = true;
  }

  function copyLink (src, dest) {
    if (grunt.file.isDir(src)) {
      grunt.file.mkdir(dest);
      return;
    }
    const destDir = path.dirname(dest);
    if (!grunt.file.exists(destDir)) {
      grunt.file.mkdir(destDir);
    }
    if (!grunt.option('no-hardlink')) {
      try {
        if (grunt.file.exists(dest)) {
          grunt.file.delete(dest);
        }
        fs.linkSync(src, dest);
      } catch (e) {
        grunt.file.copy(src, dest);
      }
    } else {
      grunt.file.copy(src, dest);
    }
  }

  function copyMany (src, dest, patterns) {
    const paths = grunt.file.expand({ cwd: src }, patterns);
    paths.forEach(function (p) {
      const srcPath = path.join(src, p);
      const destPath = path.join(dest, p);
      copyLink(srcPath, destPath);
    });
  }

  const libs = [];
  grunt.file.expand(
    ['togetherjs/*.js', '!togetherjs/randomutil.js', '!togetherjs/recorder.js', '!togetherjs/togetherjs.js']
  ).forEach(function (filename) {
    filename = filename.replace(/^togetherjs\//, '');
    filename = filename.replace(/\.js$/, '');
    libs.push(filename);
  });
  const langs = [];
  grunt.file.expand('togetherjs/locale/*.json').forEach(function (langFilename) {
    const lang = path.basename(langFilename).replace(/\.json/, '');
    langs.push(lang);
    libs.push('templates-' + lang);
  });

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    less: {
      development: {
        files: {
          "<%= grunt.option('dest') || 'build' %>/togetherjs/togetherjs.css": 'togetherjs/togetherjs.less',
          "<%= grunt.option('dest') || 'build' %>/togetherjs/recorder.css": 'togetherjs/recorder.less'
        },
        options: {
          dumpLineNumbers: dumpLineNumbers
        }
      }
    },

    requirejs: {
      compile: {
        options: {
          baseUrl: 'togetherjs/',
          // paths: requirejsPaths,
          include: ['libs/almond'].concat(libs),
          // Wrap any build bundle in a start and end text specified by wrap.
          // Use this to encapsulate the module code so that define/require are
          // not globals. The end text can expose some globals from your file,
          // making it easy to create stand-alone libraries that do not mandate
          // the end user use requirejs.
          wrap: {
            start: '(function() {',
            end: 'TogetherJS.require = TogetherJS._requireObject = require;\nTogetherJS._loaded = true;\nrequire(["session"]);\n}());'
          },
          optimize: 'none',
          out: function writer (text) {
            const dest = path.join(grunt.option('dest'), 'togetherjs/togetherjsPackage.js');
            grunt.file.write(dest, text);
          }
        }
      }
    },

    jshint: {
      options: {
        curly: true,
        browser: true,
        globals: {
          define: true
        }
      },
      all: [
        'Gruntfile',
        'togetherjs/*.js'
      ]
    },

    csslint: {
      // Check here for options: https://github.com/stubbornella/csslint/wiki/Rules
      options: {
        csslintrc: '.csslint.rc'
      },
      src: [path.join(grunt.option('dest'), 'togetherjs/togetherjs.css')]
    },

    watch: {
      main: {
        files: ['togetherjs/**/*', 'Gruntfile.js'],
        tasks: ['build'],
        options: {
          nospawn: true
        }
      },
      site: {
        files: ['togetherjs/**/*', 'Gruntfile.js', 'site/**/*', '!**/*_flymake*', '!**/*~', '!**/.*'],
        tasks: ['build', 'buildsite']
      },
      // FIXME: I thought I wouldn't have to watch for
      // togetherjs/**/*.js, but because the hard links are regularly
      // broken by git, this needs to be run often, and it's easy to
      // forget.  Then between git action the build will be over-run,
      // but that's harmless.
      minimal: {
        files: ['togetherjs/**/*.less', 'togetherjs/togetherjs.js', 'togetherjs/templates-localized.js',
          'togetherjs/**/*.html', 'togetherjs/**/*.js', '!**/*_flymake*', 'togetherjs/locales/**/*.json'],
        tasks: ['build']
      }
    },

    'http-server': {
      test: {
        // the server root directory
        root: '.',
        cache: 30,
        // showDir: true,
        // autoIndex: true,
        // run in parallel with other tasks
        runInBackground: true
      }
    },

    'phantom-tests': grunt.file.expand({
      cwd: 'togetherjs/tests/'
    }, 'test_*.js', 'func_*.js', 'interactive.js', '!test_ot.js')
      .reduce(function (o, k) { o[k] = {}; return o; }, {})

  });

  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-csslint');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('config-requirejs', function () {
    // configure the requirejs paths based on the current options
    const requirejsPaths = {
      jquery: 'libs/jquery-1.11.1.min',
      walkabout: 'libs/walkabout/walkabout',
      esprima: 'libs/walkabout/lib/esprima',
      falafel: 'libs/walkabout/lib/falafel',
      tinycolor: 'libs/tinycolor',
      whrandom: 'libs/whrandom/random',
      jqueryui: 'libs/jquery-ui.min',
      jquerypunch: 'libs/jquery.ui.touch-punch.min',
      // Make sure we get the built form of this one:
      templates: path.join('..', grunt.option('dest'), 'togetherjs/templates')
    };
    langs.forEach(function (lang) {
      requirejsPaths['templates-' + lang] =
        path.join('..', grunt.option('dest'), 'togetherjs', 'templates-' + lang);
    });
    grunt.config.merge({
      requirejs: {
        compile: {
          options: {
            paths: requirejsPaths
          }
        }
      }
    });
    grunt.task.run('requirejs');
  });

  grunt.registerTask('copylib', 'copy the library', function () {
    const pattern = ['**', '!togetherjs.js', '!templates-localized.js', '!**/*.less', '!#*', '!**/*_flymake*', '!**/*.md', '!**/*.tmp', '!**/#*'];
    grunt.log.writeln('Copying files from ' + 'togetherjs/'.cyan + ' to ' + path.join(grunt.option('dest'), 'togetherjs').cyan);
    if (grunt.option('exclude-tests')) {
      pattern.push('!tests/');
      pattern.push('!tests/**');
      grunt.log.writeln('  (excluding tests)');
    }
    copyMany(
      'togetherjs/', path.join(grunt.option('dest'), 'togetherjs'),
      pattern
    );
  });

  grunt.registerTask('copysite', 'copy the site (not library)', function () {
    grunt.log.writeln('Copying files from ' + 'site/'.cyan + ' to ' + grunt.option('dest').cyan);
    copyMany(
      'site/', grunt.option('dest'),
      ['**', '!**/*.tmpl', '!**/*.html', '!public/**', '!**/*_flymake*', '!**/*.md']);
    copyMany(
      'site/public/', grunt.option('dest'),
      ['**']);
  });

  grunt.registerTask('build', ['copylib', 'maybeless', 'substitute', 'config-requirejs']);
  grunt.registerTask('buildsite', ['copysite', 'render', 'rendermd', 'docco']);
  grunt.registerTask('devwatch', ['build', 'watch:minimal']);
  // For some reason doing ["build", "buildsite", "watch:site"]
  // doesn't work, it gets through buildsite and doesn't watch;
  // instead just doing watch:site seems okay:
  grunt.registerTask('sitewatch', ['buildsite', 'watch:site']);

  function escapeString (s) {
    if (typeof s !== 'string') {
      throw new Error('Not a string: ' + s);
    }
    const data = JSON.stringify(s);
    return data.substr(1, data.length - 2);
  }

  grunt.registerTask(
    'substitute',
    'Substitute templates-localized.js and parameters in togetherjs.js',
    function () {
      // FIXME: I could use grunt.file.copy(..., {process: function (content, path) {}}) here
      const baseUrl = grunt.option('base-url') || ''; // baseURL to be entered by the user
      if (!baseUrl) {
        grunt.log.writeln('No --base-url, using auto-detect');
      }
      const destBase = grunt.option('dest') || 'build'; // where to put the built files. If not indicated then into build/
      const hubUrl = grunt.option('hub-url') || process.env.HUB_URL || 'http://localhost:8080'; // URL of the hub server
      grunt.log.writeln('Using hub URL ' + hubUrl.cyan);
      const gitCommit = process.env.GIT_COMMIT || '';
      const subs = {
        __interface_html__: grunt.file.read('togetherjs/interface.html'),
        __help_txt__: grunt.file.read('togetherjs/help.txt'),
        __walkthrough_html__: grunt.file.read('togetherjs/walkthrough.html'),
        __baseUrl__: baseUrl,
        __hubUrl__: hubUrl,
        __gitCommit__: gitCommit
      };

      function substituteContent (content, s) {
        for (const v in s) {
          const re = new RegExp(v, 'g');
          if (typeof s[v] !== 'string') {
            grunt.log.error('Substitution variable ' + v.cyan + ' is not a string');
          }
          content = content.replace(re, escapeString(s[v]));
        }
        return content;
      }

      const filenames = {
        'togetherjs.js': {
          src: 'togetherjs/togetherjs.js',
          extraVariables: { __min__: 'no' }
        },
        'togetherjs-min.js': {
          src: 'togetherjs/togetherjs.js',
          extraVariables: { __min__: 'yes' }
        }
      };

      for (let dest in filenames) {
        const info = filenames[dest];
        const src = info.src;
        const extraVariables = info.extraVariables;
        dest = destBase + '/' + dest;
        let content = fs.readFileSync(src, 'UTF-8');
        let s = subs;

        if (extraVariables) {
          s = Object.create(subs);
          for (const a in extraVariables) {
            s[a] = extraVariables[a];
          }
        }
        content = substituteContent(content, s);
        grunt.log.writeln('writing ' + src.cyan + ' to ' + dest.cyan);
        grunt.file.write(dest, content);
      }

      grunt.file.expand('togetherjs/locale/*.json').forEach(function (langFilename) {
        let templates = grunt.file.read('togetherjs/templates-localized.js');
        const lang = path.basename(langFilename).replace(/\.json/, '');
        const translation = JSON.parse(grunt.file.read(langFilename));
        const dest = path.join(grunt.option('dest'), 'togetherjs/templates-' + lang + '.js');

        const translatedInterface = translateFile('togetherjs/interface.html', translation);
        const translatedHelp = translateFile('togetherjs/help.txt', translation);
        const translatedWalkthrough = translateFile('togetherjs/walkthrough.html', translation);

        subs.__interface_html__ = translatedInterface;
        subs.__help_txt__ = translatedHelp;
        subs.__walkthrough_html__ = translatedWalkthrough;
        subs.__names__ = translation.names;
        templates = substituteContent(templates, subs);

        grunt.file.write(dest, templates);
        grunt.log.writeln('writing ' + dest.cyan + ' based on ' + langFilename.cyan);
      });

      return true;
    }
  );

  function translateFile (source, translation) {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('./'));
    const tmpl = env.getTemplate(source);
    return tmpl.render({
      gettext: function (string) {
        return translation[string] || string;
      }
    });
  }

  grunt.registerTask('maybeless', 'Maybe compile togetherjs.less', function () {
    const sources = grunt.file.expand(['togetherjs/**/*.less', 'site/**/*.less']);
    let found = false;
    sources.forEach(function (fn) {
      const source = fs.statSync(fn);
      const destFn = grunt.option('dest') + '/' + fn.substr(0, fn.length - 4) + 'css';
      if (!fs.existsSync(destFn)) {
        found = true;
        return;
      }
      const dest = fs.statSync(destFn);
      if (source.mtime.getTime() > dest.mtime.getTime()) {
        grunt.log.writeln('Destination LESS out of date: ' + destFn.cyan);
        found = true;
      }
    });
    if (found) {
      grunt.task.run('less');
    } else {
      grunt.log.writeln('No .less files need regenerating.');
    }
  });

  grunt.registerTask('render', 'Render the site', function () {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('site/'));
    const sources = grunt.file.expand({ cwd: 'site/' }, '**/*.html');
    sources.forEach(function (source) {
      const dest = grunt.option('dest') + '/' + source;
      grunt.log.writeln('Rendering ' + source.cyan + ' to ' + dest.cyan);
      let data = grunt.file.read('site/' + source);
      const tmplVars = Object.create(vars);
      while (true) {
        const match = /\{\#\s+set\s+([^\s]+)\s+([^#]+)\s*\#\}/.exec(data);
        if (!match) {
          break;
        }
        tmplVars[match[1]] = JSON.parse(match[2]);
        grunt.log.writeln('  Found variable ' + match[1] + ' = ' + match[2]);
        data = data.substr(match.index + match[0].length);
      }
      tmplVars.base = path.relative(path.dirname('site/' + source), 'site/');
      if (tmplVars.base && tmplVars.base.search(/\/$/) === -1) {
        tmplVars.base += '/';
      }
      if (tmplVars.absoluteLinks) {
        tmplVars.base = '/';
      }
      tmplVars.base = tmplVars.base.replace(/\\/g, '/');
      const tmpl = env.getTemplate(source);
      const result = tmpl.render(tmplVars);
      grunt.file.write(dest, result);
    });
  });

  function parseMarkdownOutput (doc) {
    let title = (/<h1[^>]*>(.*)<\/h1>/i).exec(doc);
    title = title[1];
    const body = doc.replace(/<h1[^>]*>.*<\/h1>/i, '');
    return {
      title: title,
      body: body
    };
  }

  function addHeaderIds (doc) {
    const result = [];
    while (doc) {
      const match = (/(<h\d)>(.*)(<\/h\d>)/i).exec(doc);
      if (!match) {
        result.push(doc);
        break;
      }
      let id = match[2];
      id = id.toLowerCase();
      id = id.replace(/ +/g, '-');
      id = id.replace(/[^a-z0-9_\-]/g, '');
      const header = match[1] + ' id="' + id + '">' + match[2] + match[3];
      result.push(doc.substr(0, match.index));
      result.push(header);
      doc = doc.substr(match.index + match[0].length);
    }
    return result.join('');
  }

  function highlight (code, lang) {
    const hjs = require('highlight.js');
    const aliases = {
      html: 'xml',
      js: 'javascript'
    };
    lang = aliases[lang] || lang;
    try {
      if (lang) {
        return hjs.highlight(lang, code).value;
      } else {
        return hjs.highlightAuto(code).value;
      }
    } catch (e) {
      grunt.fail.fatal('Error highlighting: ' + e);
      throw e;
    }
  }

  marked.setOptions({ highlight: highlight });

  grunt.registerTask('rendermd', 'Render the site Markdown files', function () {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('site/'));
    const sources = grunt.file.expand({ cwd: 'site/' }, '**/*.md', '!**/README.md');
    sources.forEach(function (source) {
      const basename = source.replace(/\.md$/, '');
      const dest = grunt.option('dest') + '/' + basename + '.html';
      grunt.log.writeln('Rendering ' + source.cyan + ' to ' + dest.cyan);
      const data = grunt.file.read('site/' + source);
      let templateName = 'generic-markdown.tmpl';
      const match = (/template:\s*([a-zA-Z_\-0-9.]*)/).exec(data);
      if (match) {
        templateName = match[1];
      }
      const html = marked(data, {
        smartypants: true
      });
      const parsed = parseMarkdownOutput(html);
      parsed.body = addHeaderIds(parsed.body);
      const tmpl = env.getTemplate(templateName);
      const tmplVars = Object.create(vars);
      tmplVars.markdownBody = parsed.body;
      tmplVars.title = parsed.title;
      tmplVars.base = path.relative(path.dirname('site/' + source), 'site/');
      if (tmplVars.base && tmplVars.base.search(/\/$/) === -1) {
        tmplVars.base += '/';
      }
      tmplVars.base = tmplVars.base.replace(/\\/g, '/');
      const result = tmpl.render(tmplVars);
      grunt.file.write(dest, result);
    });
  });

  function doccoFormat (source, sections) {
    sections.forEach(function (section) {
      let code = highlight(section.codeText, 'javascript');
      code = code.replace(/\s+$/, '');
      section.codeHtml = "<div class='highlight'><pre>" + code + '</pre></div>';
      section.docsHtml = marked(section.docsText);
    });
  }

  grunt.registerTask('docco', 'Create comment-separating source code', function () {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('site/'));
    const sources = grunt.file.expand({ cwd: 'togetherjs/' }, '*.js');
    sources.sort();
    const sourceDescriptions = JSON.parse(grunt.file.read('togetherjs/module-descriptions.json'));
    const sourceList = [];
    sources.forEach(function (source) {
      const name = source.replace(/\.js$/, '');
      sourceList.push({
        name: name,
        link: source + '.html',
        description: marked(sourceDescriptions[name] || '', { smartypants: true })
      });
    });
    sources.forEach(function (source) {
      const sourceName = source.replace(/\.js$/, '');
      const dest = grunt.option('dest') + '/source/' + source + '.html';
      grunt.log.writeln('Rendering ' + source.cyan + ' to ' + dest.cyan);
      const code = grunt.file.read('togetherjs/' + source);
      const sections = docco.parse(source, code, { languages: {} });
      doccoFormat(source, sections);
      sections.forEach(function (section, i) {
        section.index = i;
        section.empty = section.codeText.replace(/\s/gm, '') === '';
      });
      const first = marked.lexer(sections[0].docsText)[0];
      const hasTitle = first && first.type === 'heading' && first.depth === 1;
      const title = hasTitle ? first.text : path.basename(source, '.js');
      const tmpl = env.getTemplate('source-code.tmpl');
      const tmplVars = Object.create(vars);
      tmplVars.title = title;
      tmplVars.sections = sections;
      tmplVars.source = source;
      tmplVars.sourceName = sourceName;
      tmplVars.sourceDescription = marked(sourceDescriptions[sourceName] || '', { smartypants: true });
      tmplVars.base = '../';
      tmplVars.sourceList = sourceList;
      const result = tmpl.render(tmplVars);
      grunt.file.write(dest, result);
    });
    const tmplVars = Object.create(vars);
    tmplVars.title = 'TogetherJS Source Code';
    tmplVars.sourceList = sourceList;
    tmplVars.base = '../';
    const tmpl = env.getTemplate('source-code-index.tmpl');
    grunt.file.write(grunt.option('dest') + '/source/index.html', tmpl.render(tmplVars));
  });

  grunt.registerTask('buildaddon', 'Build the Firefox addon and move the XPI into the site', function () {
    const done = this.async();
    grunt.util.spawn({
      cmd: 'cfx',
      args: ['xpi'],
      opts: {
        cwd: 'addon/'
      }
    }, function (error, result, code) {
      if (error) {
        grunt.log.error('Error running cfx xpi: ' + error.toString().cyan);
        grunt.fail.fatal('Error creating XPI');
        done();
        return;
      }
      const dest = path.join(grunt.option('dest'), 'togetherjs.xpi');
      grunt.file.copy('addon/togetherjs.xpi', dest);
      grunt.log.writeln('Created ' + dest.cyan);
      done();
    });
  });

  grunt.registerTask('publish', 'Publish to togetherjs.mozillalabs.com/public/', function () {
    if (!grunt.file.isDir('togetherjs.mozillalabs.com')) {
      grunt.log.writeln('Error: you must check out togetherjs.mozillalabs.com');
      grunt.log.writeln('Use:');
      grunt.log.writeln('  $ git clone -b togetherjs.mozillalabs.com git:git@github.com:mozilla/togetherjs.git togetherjs.mozillalabs.com');
      grunt.log.writeln('  $ cd togetherjs.mozillalabs.com/.git');
      grunt.log.writeln("  $ echo '[remote \"staging\"]\n\turl = git@heroku.com:togetherjs-staging.git\n\tpush = refs/heads/togetherjs.mozillalabs.com:refs/heads/master\n[remote \"production\"]\n\turl = git@heroku.com:togetherjs.git\n\tpush = refs/heads/togetherjs.mozillalabs.com:refs/heads/master\n' >> config");
      grunt.fail.fatal('Must checkout togetherjs.mozillalabs.com');
      return;
    }
    const versions = 'togetherjs.mozillalabs.com/public/versions';
    if (!grunt.file.isDir(versions)) {
      grunt.log.writeln('Error: ' + versions.cyan + ' does not exist');
      grunt.fail.fatal('No versions/ directory');
      return;
    }
    const tmp = 'togetherjs.mozillalabs.com/public_versions_tmp';
    fs.rename(versions, tmp);
    grunt.file.delete('togetherjs.mozillalabs.com/public');
    grunt.file.mkdir('togetherjs.mozillalabs.com/public');
    fs.rename(tmp, versions);
    if (!grunt.option('base-url')) {
      grunt.option('base-url', 'https://togetherjs.com');
    }
    grunt.option('dest', 'togetherjs.mozillalabs.com/public');
    grunt.option('exclude-tests', true);
    grunt.option('no-hardlink', true);
    grunt.task.run(['build', 'buildsite', 'buildaddon']);
    grunt.task.run(['movecss']);
    grunt.log.writeln('To actually publish you must do:');
    grunt.log.writeln('  $ cd togetherjs.mozillalabs.com/');
    grunt.log.writeln('  $ git add -A');
    grunt.log.writeln("  $ git commit -a -m 'Publish'");
    grunt.log.writeln('  $ git push && git push staging');
  });

  grunt.registerTask('publishversion', 'Publish to togetherjs.mozillalabs.com/public/versions/', function () {
    const version = grunt.option('togetherjs-version');
    if (!version) {
      grunt.log.error('You must provide a --togetherjs-version=X.Y argument');
      grunt.fail.fatal('No --togetherjs-version');
      return;
    }
    if (!grunt.file.isDir('togetherjs.mozillalabs.com/public/versions')) {
      grunt.log.error('The directory togetherjs.mozillalabs.com/public/versions does not exist');
      grunt.fail.fatal();
      return;
    }
    const destDir = 'togetherjs.mozillalabs.com/public/versions/' + version;
    if (grunt.file.exists(destDir)) {
      grunt.log.error('The directory ' + destDir + ' already exists');
      grunt.log.error('  Delete it first to re-create version');
      grunt.fail.fatal();
      return;
    }
    grunt.option('base-url', 'https://togetherjs.com/versions/' + version);
    grunt.option('dest', destDir);
    grunt.option('exclude-tests', true);
    grunt.option('no-hardlink', true);
    grunt.task.run(['build']);
    grunt.task.run(['movecss']);
    let readme = grunt.file.read('togetherjs.mozillalabs.com/public/versions/README.md');
    readme += '  * [' + version + '](./' + version + '/togetherjs.js)\n';
    grunt.file.write('togetherjs.mozillalabs.com/public/versions/README.md', readme);
  });

  grunt.registerTask('movecss', 'Publish generated css files to dest', function () {
    // Can't figure out how to parameterize the less task, hence this lame move
    ['togetherjs/togetherjs.css', 'togetherjs/recorder.css'].forEach(function (css) {
      const src = path.join('build', css);
      const dest = path.join(grunt.option('dest'), css);
      grunt.file.copy(src, dest);
      grunt.log.writeln('Copying ' + src.cyan + ' to ' + dest.cyan);
    });
  });

  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('dev', function () {
    grunt.util.spawn({
      cmd: 'node',
      args: ['devserver.js']
    });
    grunt.task.run('watch');
  });

  grunt.registerTask('test', 'Run jshint and test suite', ['jshint', 'phantom']);
  grunt.loadNpmTasks('grunt-http-server');

  grunt.registerTask('phantom', ['phantom-setup', 'phantom-tests']);

  grunt.registerTask('phantom-setup', 'Run jdoctest test suite in phantomjs',
    function () {
      const done = this.async();
      // find unused ports for web server and hub
      const freeport = require('freeport');
      freeport(function (err1, hubPort) {
        freeport(function (err2, webPort) {
          if (err1 || err2) { return done(err1 || err2); }

          // build togetherjs using these default ports
          grunt.option('base-url', 'http://localhost:' + webPort + '/' + TESTDIR + '/');
          grunt.option('hub-url', 'http://localhost:' + hubPort);
          grunt.option('no-hardlink', true);
          grunt.option('dest', TESTDIR);
          // make sure the web server will use the right port
          grunt.config.merge({
            'http-server': {
              test: {
                port: webPort,
                host: 'localhost'
              }
            }
          });
          // spawn a hub, using the hub port
          const hub = require('./hub/server');
          hub.startServer(hubPort, 'localhost');
          // build & start the web server
          grunt.task.run('build', 'http-server:test');
          // ok, now we can run the tests in phantomjs!
          done();
        });
      });
    });

  // PhantomJS event handlers
  const phantomjs = require('grunt-lib-phantomjs').init(grunt);
  let phantomStatus;

  phantomjs.on('fail.load', function (url) {
    phantomjs.halt();
    grunt.verbose.write('Running PhantomJS...').or.write('...');
    grunt.log.error('PhantomJS unable to load "' + url + '" URI.');
    phantomStatus.failed += 1;
    phantomStatus.total += 1;
  });

  phantomjs.on('fail.timeout', function () {
    phantomjs.halt();
    grunt.log.writeln();
    grunt.log.error('PhantomJS timed out.');
    phantomStatus.failed += 1;
    phantomStatus.total += 1;
  });

  phantomjs.on('doctestjs.pass', function (result) {
    phantomStatus.total += 1;
    grunt.verbose.ok('Passed: ' + result.example.summary);
  });

  phantomjs.on('doctestjs.fail', function (result) {
    phantomStatus.failed += 1;
    phantomStatus.total += 1;
    grunt.log.error('Failed: ' + result.example.expr);
    grunt.log.subhead('Expected:');
    grunt.log.writeln(result.example.expected);
    grunt.log.subhead('Got:');
    grunt.log.writeln(result.got);
  });

  phantomjs.on('doctestjs.end', function () {
    phantomjs.halt();
  });

  // Pass through console.log statements (when verbose)
  phantomjs.on('console', grunt.verbose.writeln);

  grunt.registerMultiTask('phantom-tests', function () {
    grunt.task.requires('phantom-setup');
    const url = grunt.option('base-url') +
      'togetherjs/tests/index.html?name=' + this.target;
    grunt.verbose.writeln('Running tests at: ' + url);

    // Merge task-specific and/or target-specific options with these defaults.
    const options = this.options({
      // PhantomJS timeout, in ms.
      timeout: 10000,
      // JDoctest-PhantomJS bridge file to be injected.
      inject: path.join(__dirname, 'phantomjs', 'bridge.js'),
      // screenshot: true,
      page: {
        // leave room for the togetherjs sidebar
        viewportSize: { width: 1024, height: 1024 }
      }
    });

    // Reset test status
    phantomStatus = { failed: 0, passed: 0, total: 0, start: Date.now() };

    // Start phantomjs on this URL
    const done = this.async();
    phantomjs.spawn(url, {
      options: options,
      done: function () {
        const duration = Date.now() - phantomStatus.start;
        // Log results.
        if (phantomStatus.failed > 0) {
          grunt.warn(phantomStatus.failed + '/' + phantomStatus.total +
                     ' assertions failed (' + duration + 'ms)');
        } else if (phantomStatus.total === 0) {
          grunt.warn('0/0 assertions ran (' + duration + 'ms)');
        } else {
          grunt.verbose.writeln();
          grunt.log.ok(phantomStatus.total + ' assertions passed (' + duration + 'ms)');
        }
        // All done!
        done();
      }
    });
  });

  grunt.registerTask('default', 'start');
};

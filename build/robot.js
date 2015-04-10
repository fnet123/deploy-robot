// Generated by CoffeeScript 1.7.1
(function() {
  var ChildProcess, Github, adapter, adapters, argv, config, delay, delayed, fs, list, logger, process, winston, _ref,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  fs = require('fs');

  ChildProcess = require('child_process');

  Github = require('github');

  winston = require('winston');

  adapters = ['github'];

  argv = require('optimist')["default"]('c', 'config.json')["default"]('t', 'github').argv;

  logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        level: 'info',
        prettyPrint: true,
        colorize: true,
        timestamp: true
      })
    ],
    exitOnError: false,
    levels: {
      info: 0,
      warn: 1,
      error: 3
    },
    colors: {
      info: 'green',
      warn: 'yellow',
      error: 'red'
    }
  });

  if (!fs.existsSync(argv.c)) {
    throw new Error('Missing config file');
  }

  if (_ref = argv.t, __indexOf.call(adapters, _ref) < 0) {
    throw new Error("Adapter " + argv.t + " is not exists");
  }

  config = JSON.parse(fs.readFileSync(argv.c));

  adapter = new (require('./adapter/' + argv.t))(config);

  list = [];

  delayed = {};

  delay = function(time, fn, id) {
    if (delayed[id] != null) {
      return;
    }
    list.push([Date.now() + time, fn, id]);
    return delayed[id] = true;
  };

  setInterval(function() {
    var cb, fn, id, now, time;
    cb = list.shift();
    now = Date.now();
    if (cb != null) {
      time = cb[0], fn = cb[1], id = cb[2];
      if (now >= time) {
        delete delayed[id];
        return fn();
      } else {
        return list.push(cb);
      }
    }
  }, 5000);

  setInterval(function() {
    logger.info('fetching issues ...');
    return adapter.scheduler(process);
  }, 15000);

  process = function(issues, repo) {
    return issues.forEach(function(issue) {
      var deploy, id, users;
      adapter.selfAssign(repo, issue);
      id = adapter.makeId(repo, issue);
      logger.info("found " + id);
      deploy = function(id, delayed) {
        if (delayed == null) {
          delayed = false;
        }
        logger.info("deploying " + id);
        return ChildProcess.exec(repo.command, function(err, result, error) {
          var body, close;
          body = '';
          close = true;
          if (err) {
            logger.error(err);
            if (delayed) {
              body += "Retry failed\n\n";
            } else {
              close = false;
              body += "An exception occurred, I'll try it again later\n\n";
              delay(300000, (function() {
                return deploy(id, true);
              }), id);
            }
            if (result.length > 0) {
              body += "## Console\n```\n" + result + "\n```\n\n";
            }
            if (error.length > 0) {
              body += "## Error\n```\n" + error + "\n```\n\n";
            }
          } else {
            body += "Success\n\n";
            if (result.length > 0) {
              body += "## Console\n```\n" + result + "\n```\n\n";
            }
          }
          return adapter.finish(repo, issue, body, close);
        });
      };
      logger.info("posting comment");
      if (repo.confirm != null) {
        users = repo.confirm instanceof Array ? repo.confirm : repo.confirm.split(',');
        return adapter.comment(repo, issue, 'Waiting for confirmation by ' + ((users.map(function(user) {
          return '@' + user;
        })).join(', '))("\n\n> Please type `confirm` to confirm or type `stop` to cancel.", function(currentComment) {
          var delayDeploy;
          delayDeploy = function() {
            return adapter.confirm(repo, issue, users, currentComment, function(repo, issue) {
              return adapter.comment(repo, issue, "Confirmation received, deploying ...", function() {
                return deploy("" + id + "#deploy");
              });
            }, function(repo, issue, user) {
              return adapter.finish(repo, issue, "Deployment cancelled by @" + user, true);
            }, function(repo, issue) {
              return delay(15000, delayDeploy, id);
            });
          };
          return delay(15000, delayDeploy, id);
        }));
      } else {
        return adapter.comment(repo, issue, 'Deploying ...', function() {
          return deploy("" + id + "#deploy");
        });
      }
    });
  };

}).call(this);

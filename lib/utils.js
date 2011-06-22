
var util = require('util');

exports.ConsistenceError = function(action, property, where, shoudBe) {
    this.name = 'ConsistenceError: inconsistent property ' + property + ' for action ' + action
        + (where ? ' in ' + where : '')
        + (shoudBe !== undefined ? ', should be "' + shoudBe + '"' : '');
    Error.call(this);
    Error.captureStackTrace(this, arguments.callee);
}

util.inherits(exports.ConsistenceError, Error);


exports.CloudTimeout = function(action, timeout) {
    this.name = 'CloudTimeout: task for action ' + action + ' timeout out (timeout: ' + timeout + ' ms)';
    Error.call(this);
    Error.captureStackTrace(this, arguments.callee);
}

util.inherits(exports.CloudTimeout, Error);


exports.AtomicTaskCollision = function(task, action) {
    this.name = 'AtomicTaskCollision: atomic task ' + task.id + ' is already processing at the moment (action ' + action + ')';
    Error.call(this);
    Error.captureStackTrace(this, arguments.callee);
}

util.inherits(exports.AtomicTaskCollision, Error);


var util = require('util');


/**
 * Extend _obj_ with _props_, where all _props_
 *
 * @param  {mixed} obj
 * @param  {hash} props
 * @api public
 */
exports.extend = function(obj, props) {
    for (var i = 1; i < arguments.length; i++) {
        (function(props) {
            Object.getOwnPropertyNames(props).forEach(function(prop) {
                if (!obj.hasOwnProperty(prop)) {
                    Object.defineProperty(obj, prop, Object.getOwnPropertyDescriptor(props, prop))
                }
            })
        })(arguments[i])
    }
    return obj;
}

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

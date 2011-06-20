
var util = require('util'),
    crypto = require('crypto');

function Action(name, config) {
    
    process.EventEmitter.call(this);
    
    this.name = name;
    
    if (typeof config === 'function') {
        this.fn = config;
    }
    else {
        this.fn = config.fn;
    }
    
    for (var k in Action.defaults) {
        this[k] = typeof config[k] !== 'undefined' ? config[k] : Action.defaults[k];
    }
    
    this._inprog = [];
    this._queue = [];
    
    // Action id
    this.id = crypto.createHash('md5').update([
        this.name,
        this.fn.toString()
    ].join('')).digest('hex');
    
    // Action synopsis
    this.synopsis = this.fn.toString().match(/^(function\s+[^\(]*\([^\)]+\))/)[1];
}

util.inherits(Action, process.EventEmitter);

Action.defaults = {
    threads : 0, // infinite parallel number
    atomic : false, // each task is not unique
    timeout : 0 // action timeout 
}

Action.Task = require('./action/task');

Action.prototype.push = function(id, args, callback) {
    this._queue.push(new Action.Task(this.name, id, args, callback));
    this.process();
}

Action.prototype.process = function() {
    var self = this;
    while (this._queue.length) {
        var task = this._queue.shift();
        var args = task.args.concat([function(){
            self._inprog = self._inprog.splice(self._inprog.indexOf(task), 1);
            task.callback.apply(null, arguments);
        }]);
        this.fn.apply(null, args);
        this._inprog.push(task);
    }
}

module.exports = Action;


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
    
    this.saturated = false;
    this.tasksDone = 0;
    this.totalTime = 0;
    this.avgTime = 0;
    
    this._inprog = [];
    this._queue = [];
    
    // Action id
    this.id = crypto.createHash('md5').update([
        this.name,
        this.fn.toString()
    ].join('')).digest('hex');
    
    // Action synopsis
    this.synopsis = this.fn.toString().match(/^(function\s+[^\(]*\([^\)]*\))/)[1];
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
    while (this._queue.length && !this.saturated) {
        this.processTask(this._queue.shift());
    }
}

Action.prototype.processTask = function(task) {
    
    var self = this, start;
    var args = task.args.concat([function taskComplete(){
        
        var time = new Date - start;
        self._inprog.splice(self._inprog.indexOf(task), 1);
        self.tasksDone++;
        self.totalTime += time;
        self.avgTime = self.totalTime / self.tasksDone;
        
        task.callback.apply(null, arguments);
        
        if (self.threads && self._inprog.length < self.threads) {
            self.saturated = false;
        }
        if (!self._queue.length) {
            self.emit('empty');
            if (!self._inprog.length) {
                self.emit('drain');
            }
        }
        
        self.process();
    }]);
    
    process.nextTick(function(){
        start = new Date;
        self.fn.apply(null, args);
    });
    
    this._inprog.push(task);
    
    if (this.threads && this._inprog.length >= this.threads) {
        this.saturated = true;
        console.log('action %s saturated', this.name);
    }
}

module.exports = Action;

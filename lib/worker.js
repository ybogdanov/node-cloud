
var util = require('util'),
    utils = require('./utils'),
    os = require('os'),
    redis = require('redis');
    
var REDIS_CLIENT = 1,
    REDIS_CLIENT_QUEUE = 2;

function Worker(config) {
    
    process.EventEmitter.call(this);
    
    this._actions = {};
    this._loadConfig(config);
    this._running = false;
    
    this.name = os.hostname() + ':' + process.pid;
    this.redisClients = {};
}

util.inherits(Worker, process.EventEmitter);

// Mixin with base functionality
require('./mixins/base')(Worker.prototype);
// Mixin with mutes functionality
require('./mixins/mutex')(Worker.prototype);

Worker.defaults = {
    ns : 'default',
    prefix : 'cloud',
    redis : {
        host : '127.0.0.1',
        port : 6379
    },
    debug : false,
    maintainInterval : 1000,
    maintainTimeout : 10000,
    cleanDeadlocksRate : .05,
    defaultPullTimeout : 10000,
    shutdownTimeout : null
}

Worker.Action = require('./worker/action');

Worker.prototype._loadConfig = function(config) {
    
    var self = this;
    
    if (typeof config.redis !== 'undefined') {
        config.redis.__proto__ = Worker.defaults.redis;
    }

    config.__proto__ = Worker.defaults;
    
    this.config = config;
    this.ns = config.ns;
    
    Object.keys(config.actions).forEach(function(actionName){
        self._actions[actionName] = new Worker.Action(actionName, config.actions[actionName]);
    })
}


Worker.prototype.start = function() {
    
    var self = this;
    
    this._debug('start; checking interface');
    
    // Check interface consistency
    this.checkInterface(function(err){
        if (err) {
            self.emit('error', err);
            return self.destroy();
        }
        
        self._debug('started');
        
        self._running = true;
        
        self.emit('start');
        
        self._maintainIntervalId = setInterval(function(){
            self._maintain();
        }, self.config.maintainInterval)
        
        self._pull();
    })
    
    return this;
}

Worker.prototype.shutdown = function(callback) {
    
    var self = this;
    
    this._running = false;
    
    self._debug('shutting down');
    
    if (this.redisClients[REDIS_CLIENT_QUEUE]) {
        this.redisClients[REDIS_CLIENT_QUEUE].end();
    }
    
    var num = 0;
    Object.keys(this._actions).forEach(function(key){
        if (self._actions[key]._inprog.length) {
            num++;
            self._actions[key].once('super-drain', function(){
                --num || complete();
            })
        }
    })
    
    if (!num) {
        return complete();
    }
    
    // check pending tasks
    var aliveInterval = setInterval(function(){
        self.emit('workerWaiting', num);
    }, 2000);
    
    function complete() {
        self._debug('shutdown complete');
        clearInterval(aliveInterval);
        self.destroy(callback);
    }
    
    if (this.config.shutdownTimeout) {
        setTimeout(function(){
            num = 0;
            self._debug('shutdown timeout');
            self.emit('workerTimeout', self.config.shutdownTimeout);
            self.destroy(callback);
        }, this.config.shutdownTimeout)
    }
}

Worker.prototype.destroy = function(callback) {
    
    var self = this;
    
    this._debug('destroy');
    
    clearInterval(this._maintainIntervalId);
    
    this._maintain(false, function(err){
        if (err) self.emit('error', err);
        for (var key in self.redisClients) {
            self.redisClients[key].end();
            delete self.redisClients[key];
        }
        if (typeof callback === 'function') callback();
        self.emit('destroy');
    })
    
}

Worker.prototype.getRedisClient = function(type) {
    
    if (type === undefined) type = REDIS_CLIENT;
    
    if (!this.redisClients[type]) {
        var self = this;
        this.redisClients[type] = redis.createClient(this.config.redis.port, this.config.redis.host);
        this.redisClients[type].on('error', function(error){
            self.emit('error', error);
        })
    }
    
    return this.redisClients[type];
}

Worker.prototype._pull = function() {
    
    if (!this._running) return;
    
    var self = this,
        args = [],
        timeout = 0,
        actionPrefix = self.config.prefix + '/' + self.ns + '/tasks/';
        client = this.getRedisClient(REDIS_CLIENT_QUEUE);
    
    Object.keys(this._actions).forEach(function(key){
        if (!self._actions[key].saturated) {
            args.push(actionPrefix + key);
        }
        else {
            var actionAvgTime = self._actions[key].avgTime / self._actions[key].threads;
            if (!timeout || actionAvgTime <= timeout) {
                timeout = actionAvgTime || self.config.defaultPullTimeout;
            }
        }
    })
    
    if (args.length) {
        
        timeout = Math.ceil(timeout / 1000);
        self._debug('pulling (timeout %d): %s', timeout, args.join(', '));
        
        args.push(timeout, function blpopReturn(err, data){
            
            if (self._running) {
                process.nextTick(function(){
                    self._pull();
                })
            }

            if (err) return self.emit('error', err);
            if (!data) return;

            var action = data[0].substr(actionPrefix.length);
            try {
                var task = JSON.parse(data[1]);
            }
            catch (err) {
                return self.emit('error', err);
            }

            self._call(action, task);
        });

        client.blpop.apply(client, args);
    }
    else {
        setTimeout(function(){
            self._pull();
        }, timeout)
    }
}

Worker.prototype._call = function(actionName, task) {
    
    var self = this,
        action = this._actions[actionName];
    
    if (!action) {
        return self.emit('error', new Error('Undefined action: ' + actionName));
    }
    
    this._debug('task %s on %s with args: %j', task.id, actionName, task.args);
    
    function push() {
        action.push(task.id, task.args, function actionCallback(err){
            
            // Prepare data
            var data = JSON.stringify(Array.prototype.slice.call(arguments)),
                redis = self.getRedisClient(),
                key = self.config.prefix + '/' + self.ns + '/tasks/' + actionName + '/' + task.id + '/callback';

            self._debug('done task %s on %s with result: %j', task.id, actionName, data);

            function complete() {
                if (action._inprog.length + action._queue.length === 0) {
                    action.emit('super-drain');
                    self._debug('action %s drain', actionName);
                }
            }

            // Publish task response
            redis.publish(key, data, function(err) {
                if (err) return self.emit('error', err);
                if (action.atomic) {
                    self.free(actionName, task.id, function(err) {
                        if (err) self.emit('error', err);
                        complete();
                    })
                }
                else {
                    complete();
                }
            })
        });
    }
    
    if (action.atomic) {
        var lifetime = (action.avgTime * 2) || action.timeout || 60000; // 60 sec
        this.lock(actionName, task.id + '/progress', lifetime, function(err, acquired){
            if (err) return self.emit('error', err);
            if (!acquired) return self.emit('error', new utils.AtomicTaskCollision(task, actionName));
            push();
        })
    }
    else {
        push();
    }
}

Worker.prototype._maintain = function(alive, callback) {
    
    var self = this,
        key = this.config.prefix + '/' + this.ns + '/workers/' + this.name,
        redis = this.getRedisClient(),
        alive = alive === undefined ? true : alive;
    
    if (alive) {
        
        var info = {
            ns : this.ns,
            name : this.name,
            running : this._running,
            ts : +new Date,
            actions : {}
        };

        Object.keys(this._actions).forEach(function(key){
            var action = self._actions[key];
            info.actions[key] = {
                id : action.id,
                name : action.name,
                synopsis : action.synopsis,
                threads : action.threads,
                atomic : action.atomic,
                timeout : action.timeout,
                inprog : action._inprog.length,
                queue : action._queue.length,
                avgTime : action.avgTime
            }
        })
        
        redis.setex(key, Math.ceil(self.config.maintainTimeout / 1000), JSON.stringify(info), function(err){
            if (err) return self.emit('error', err);
        });
        
        // TODO: we can maintain deadlocks right on redis server using scripting
        if (Math.random() <= this.config.cleanDeadlocksRate) {
            self._debug('cleaning deadlocks');
            this.cleanDeadlocks(function(err){
                if (err) return self.emit('error', err);
            })
        }
    }
    else {
        
        redis.del(key, callback);
    }
}

Worker.prototype._debug = function() {
    if (this.config.debug) {
        arguments[0] = '[' + this.name + ' debug] ' + arguments[0];
        console.log.apply(console, arguments);
    }
}

module.exports = Worker;


var util = require('util'),
    os = require('os'),
    redis = require('redis');
    
var REDIS_CLIENT = 1,
    REDIS_CLIENT_QUEUE = 2;

function Worker(config) {
    process.EventEmitter.call(this);
    this._actions = {};
    this._loadConfig(config);
    
    this.name = os.hostname() + ':' + process.pid;
    this.redisClients = {};
}

util.inherits(Worker, process.EventEmitter);

Worker.defaults = {
    ns : 'default',
    prefix : 'cloud',
    redis : {
        host : '127.0.0.1',
        port : 6380
    }
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
    this._maintainInterval = setInterval(function(){
        self._maintain();
    }, 1000)
    
    this._pull();
}

Worker.prototype.stop = function() {
    clearInterval(this._maintainInterval);
}

Worker.prototype.restart = function() {
    
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
    
    var self = this,
        args = [],
        timeout = 0,
        actionPrefix = self.config.prefix + '/' + self.ns + '/tasks/';
        client = this.getRedisClient(REDIS_CLIENT_QUEUE);
    
    Object.keys(this._actions).forEach(function(key){
        args.push(actionPrefix + key);
    })
    
    args.push(timeout, function blpopReturn(err, data){
        
        process.nextTick(function(){
            self._pull();
        })
        
        if (err) return self.emit('error', err);
        
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

Worker.prototype._call = function(action, task) {
    var self = this;
    if (!this._actions[action]) {
        return self.emit('error', new Error('Undefined action: ' + action));
    }
    this._actions[action].push(task.id, task.args, function actionCallback(err){
        // Prepare data
        var data = JSON.stringify(Array.prototype.slice.call(arguments)),
            redis = self.getRedisClient(),
            key = self.config.prefix + '/' + self.ns + '/tasks/' + action + '/' + task.id + '/callback';
        // Publish task response
        redis.publish(key, data, function(err) {
            if (err) return self.emit('error', err);
        })
    });
}

Worker.prototype._maintain = function() {
    
    var self = this;
    var info = {
        ns : this.ns,
        name : this.name,
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
            queue : action._queue.length
        }
    })
    
    var key = this.config.prefix + '/' + this.ns + '/workers/' + this.name + '/';
    
    var redis = this.getRedisClient();
    // todo: configure maintain timeout
    redis.setex(key, 10, JSON.stringify(info), function(err){
        if (err) return self.emit('error', err);
    });
}

module.exports = Worker;

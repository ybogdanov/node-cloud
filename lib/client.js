
var util = require('util'),
    utils = require('./utils'),
    redis = require('redis'),
    crypto = require('crypto'),
    os = require('os');

var REDIS_CLIENT = 1,
    REDIS_CLIENT_SUB = 2;

function Client(config) {
    
    process.EventEmitter.call(this);
    
    this._actions = {};
    this._workers = {};
    
    this._loadConfig(config);
    this._redisClients = {};
    
    var self = this;
    this.checkInterface(function(err){
        if (err) self.emit('error', err);
    })
}

util.inherits(Client, process.EventEmitter);

// Mixin with base functionality
require('./mixins/base')(Client.prototype);
// Mixin with mutex functionality
require('./mixins/mutex')(Client.prototype);

Client.defaults = {
    ns : 'default',
    prefix : 'cloud',
    redis : {
        host : '127.0.0.1',
        port : 6379
    }
}

Client.prototype._loadConfig = function(config) {
    
    var self = this;
    
    if (typeof config.redis !== 'undefined') {
        utils.extend(config.redis, Client.defaults.redis);
    }

    utils.extend(config, Client.defaults);
    
    this.config = config;
    this.ns = config.ns;
    
    Object.keys(config.actions).forEach(function(actionName){
        if (typeof config.actions[actionName] !== 'object') {
            throw new Error('Configuration error: action should be object - ' + actionName);
        }
        self._actions[actionName] = config.actions[actionName];
        
        // Check for collision
        if (self[actionName]) {
            throw new Error('Configuration error: action should be object - ' + actionName);
        }
        
        // Register action
        self[actionName] = function action() {
            var args = Array.prototype.slice.call(arguments);
            var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            return self._call(actionName, args, callback);
        }
    })
}

Client.prototype.getRedisClient = function(type) {
    
    if (type === undefined) type = REDIS_CLIENT;
    
    if (!this._redisClients[type]) {
        var self = this;
        this._redisClients[type] = redis.createClient(this.config.redis.port, this.config.redis.host);
        this._redisClients[type].on('error', function(error){
            self.emit('error', error);
        })
        if (type === REDIS_CLIENT_SUB) {
            this._redisClients[type].on('message', function(channel, data){
                self._redisClients[type].unsubscribe(channel);
                try {
                    var args = [channel].concat(JSON.parse(data));
                }
                catch (err) {
                    return self.emit('error', err);
                }
                self.emit.apply(self, args);
            })
            this._redisClients[type].on('subscribe', function(channel, count){
                self.emit('subscribe/' + channel);
            })
        }
    }
    
    return this._redisClients[type];
}

Client.prototype._call = function(actionName, args, timeout, callback) {
    
    if (arguments.length < 4) {
        callback = timeout;
        timeout = undefined;
    }
    
    var called = false, timeoutId, timeoutStart, lockTimeoutId;
    
    var wrapCallback = function wrapCallback(err) {
        if (called) {
            if (err) self.emit('error', err);
            return;
        }
        called = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (lockTimeoutId) clearTimeout(lockTimeoutId);
        if (typeof callback === 'function') return callback.apply(null, arguments);
        else if (err) return self.emit('error', err);
    }
    
    var action = this._actions[actionName];
    if (!action) {
        return wrapCallback(new Error('No such action action ' + actionName));
    }
    
    var self = this,
        redis = this.getRedisClient(),
        key = this.config.prefix + '/' + this.ns + '/tasks/' + actionName,
        timeout = timeout || action.timeout;
    
    // Generate task id
    var id = crypto.createHash('md5');
    // Generate identifier based on action arguments
    if (action.atomic) {
        id.update(this.ns + actionName + JSON.stringify(args));
    }
    else {
        id.update(this.ns + actionName + os.hostname() + process.pid + Math.random());
    }
    // create id digest
    id = id.digest('hex');
    
    var data = JSON.stringify({
        id : id,
        args : args
    })
    
    function lockAndPush() {
        
        // Action timeout
        if (action.timeout && callback) {
            timeoutStart = +new Date;
            timeoutId = setTimeout(function(){
                timedOut = true;
                return wrapCallback(new utils.CloudTimeout(actionName, action.timeout));
            }, action.timeout)
        }
        
        // Try to acquire lock
        if (action.atomic) {

            var lifetime = action.timeout ? action.timeout : 10000; // 60 sec
            
            // TODO: rewrite to node-mutex
            self.lock(actionName, id, lifetime, function(err, acquired, ttl) {
                if (err) return wrapCallback(err);
                if (acquired) {
                    push();
                }
                // try to repeat lock after timeout (this actually needed only with callback)
                // TODO: investigate this behavior
                else if (ttl && callback) {
                    lockTimeoutId = setTimeout(function() {
                        var timeLeft;
                        if (timeoutStart && (timeLeft = +new Date - timeoutStart)) {
                            self._call(actionName, args, timeLeft, wrapCallback);
                        }
                        else {
                            self._call(actionName, args, wrapCallback);
                        }
                    }, ttl)
                }
            })
        }
        // Just push
        else {
            push();
        }
    }
    
    function push() {
        redis.rpush(key, data, function(err){
            if (err) return wrapCallback(err);
        });
    }
    
    if (callback) {
        var subKey = this.config.prefix + '/' + this.ns + '/tasks/' + actionName + '/' + id + '/callback';
        this._subscribe(subKey, wrapCallback, lockAndPush);
    }
    else {
        lockAndPush();
    }
    
    return id;
}

Client.prototype._subscribe = function(key, fn, callback)
{
    var self = this,
        client = this.getRedisClient(REDIS_CLIENT_SUB);
        
    this.once(key, function(){
        fn.apply(null, arguments);
    });
    
    if (callback) {
        this.once('subscribe/' + key, callback);
    }
    
    client.subscribe(key);
}

module.exports = Client;

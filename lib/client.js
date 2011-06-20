
var util = require('util'),
    redis = require('redis'),
    crypto = require('crypto'),
    os = require('os');

var REDIS_CLIENT = 1,
    REDIS_CLIENT_SUB = 2;

function Client(config) {
    
    process.EventEmitter.call(this);
    this._actions = {};
    this._loadConfig(config);
    this.redisClients = {};
    
    this._isReady = false;
    this._workers = {};
    this._actions = {};
}

util.inherits(Client, process.EventEmitter);

Client.defaults = {
    ns : 'default',
    prefix : 'cloud',
    redis : {
        host : '127.0.0.1',
        port : 6380
    }
}

Client.prototype._loadConfig = function(config) {
    
    var self = this;
    
    if (typeof config.redis !== 'undefined') {
        config.redis.__proto__ = Client.defaults.redis;
    }

    config.__proto__ = Client.defaults;
    
    this.config = config;
    this.ns = config.ns;
}

Client.prototype.getRedisClient = function(type) {
    
    if (type === undefined) type = REDIS_CLIENT;
    
    if (!this.redisClients[type]) {
        var self = this;
        this.redisClients[type] = redis.createClient(this.config.redis.port, this.config.redis.host);
        this.redisClients[type].on('error', function(error){
            self.emit('error', error);
        })
        if (type === REDIS_CLIENT_SUB) {
            this.redisClients[type].on('message', function(channel, data){
                self.redisClients[type].unsubscribe(channel);
                try {
                    var args = [channel].concat(JSON.parse(data));
                }
                catch (err) {
                    return self.emit('error', err);
                }
                self.emit.apply(self, args);
            })
            this.redisClients[type].on('subscribe', function(channel, count){
                self.emit('subscribe/' + channel);
            })
        }
    }
    
    return this.redisClients[type];
}

Client.prototype.ready = function(callback) {
    
    if (!this._isReady) {
        this.once('ready', callback);
    }
    if (!this._connecting) {
        var self = this;
        this._connecting = true;
        var client = this.getRedisClient();
        
        // Obtain the list of active workers
        client.keys(this.config.prefix + '/' + this.ns + '/workers/*', function(err, keys){
            if (err) {
                self._connecting = false;
                return self.emit('error', err);
            }
            if (!keys.length) {
                self._connecting = false;
                return self.emit('error', new Error('No workers connected'));
            }
            // Obtain the info for each worker
            client.mget(keys, function(err, values){
                self._connecting = false;
                if (err) return self.emit('error', err);
                self._workers = {};
                self._actions = {};
                try {
                    values.map(JSON.parse).forEach(function(worker){
                        // init worker
                        self._workers[worker.name] = worker;
                        // aggregate actions
                        Object.keys(worker.actions).forEach(function(actionKey){
                            var action = worker.actions[actionKey];
                            if (!self._actions[actionKey]) {
                                self._actions[actionKey] = {
                                    id : action.id,
                                    name : action.name,
                                    synonsis : action.synopsis,
                                    threads : [],
                                    atomic : action.atomic,
                                    timeout : action.timeout,
                                    workers : 0
                                };
                            }
                            if (self._actions[actionKey].atomic !== action.atomic) {
                                return self.emit('error', 'Action ' + action.name + ' interface inconsistence: atomic is different');
                            }
                            self._actions[actionKey].workers++;
                            self._actions[actionKey].threads.push(action.threads);
                        })
                    });
                    
                    Object.keys(self._actions).forEach(function(actionKey){
                        var action = self._actions[actionKey];
                        self[actionKey] = function() {
                            var args = Array.prototype.slice.call(arguments);
                            var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
                            self._call(actionKey, args, callback);
                        }
                    })
                    
                    self._isReady = this;
                    self.emit('ready');
                }
                catch (err) {
                    self.emit('error', err);
                }
            })
        });
    }
}

Client.prototype._call = function(actionName, args, callback) {
    
    var action = this._actions[actionName];
    if (!action) {
        return self.emit('error', new Error('Undefined action ' + actionName));
    }
    
    var self = this,
        redis = this.getRedisClient(),
        key = this.config.prefix + '/' + this.ns + '/tasks/' + actionName;
    
    // Generate task id
    var id = crypto.createHash('md5');
    // Generate identifier based on action arguments
    if (action.atomic) {
        return console.error('todo: atomic id');
    }
    else {
        id.update(this.ns + this.actionName + os.hostname() + process.pid + Math.random());
    }
    // create id digest
    id = id.digest('hex');
    
    var data = JSON.stringify({
        id : id,
        args : args
    })
    
    function push() {
        redis.rpush(key, data, function(err) {
            if (err) {
                if (callback) return callback(err);
                else return self.emit('error', err);
            }
        })
    }
    
    if (callback) {
        this._subscribe(this.config.prefix + '/' + this.ns + '/tasks/' + actionName + '/' + id + '/callback', callback, push);
    }
    else {
        push();
    }
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


var utils = require('../utils');

module.exports = function(obj){
    
    obj.lock = function(actionName, id, lifetime, callback) {

        var key = this.config.prefix + '/' + this.ns + '/tasks/' + actionName + '/' + id + '/lock',
            time = +new Date,
            lockExpire = time + lifetime,
            redis = this.getRedisClient();

        redis.setnx(key, lockExpire, function(err, locked){
            if (err) return callback(err);
            if (locked) return callback(null, true);
            redis.get(key, function(err, expireAt){
                if (err) return callback(err);
                var intExpireAt = Number(expireAt);
                if (intExpireAt < time) {
                    return redis.getset(key, lockExpire, function(err, value){
                        if (err) return callback(err);
                        callback(null, Number(value) == intExpireAt);
                    });
                }
                callback(null, false, intExpireAt - time);
            });
        });
    }
    
    obj.free = function(actionName, id, callback) {

        var self = this, keys = [id, id + '/progress'].map(function(id){
            return self.config.prefix + '/' + self.ns + '/tasks/' + actionName + '/' + id + '/lock';
        })
        
        this.getRedisClient().del(keys, callback);
    }
    
    obj.cleanDeadlocks = function(callback) {

        var pattern = this.config.prefix + '/' + this.ns + '/tasks/*/lock',
            redis = this.getRedisClient(),
            time = +new Date;
        
        redis.keys(pattern, function(err, keys){
            if (err) return callback(err);
            
            if (!keys.length) return callback();
            redis.mget(keys, function(err, values){
                if (err) return callback(err);
                
                var expired = [];
                values.forEach(function(expireAt, i){
                    if (Number(expireAt) <= time) {
                        expired.push(keys[i]);
                    }
                })
                if (!expired.length) return callback();
                
                redis.del(expired, function(err){
                    if (err) return callback(err);
                    callback();
                })
            })
            
        })
    }
}
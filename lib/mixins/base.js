
var utils = require('../utils');

module.exports = function(obj){
    
    obj.checkInterface = function(callback) {

        var self = this;
        
        this.getInterface(function(err, actions){
            if (err) return callback(err);

            // Check consistence
            Object.keys(self._actions).forEach(function(actionKey){
                if (actions[actionKey]) {
                    // check interface consistence
                    ['atomic'].forEach(function(property) {
                        if (typeof self._actions[actionKey][property] === 'undefined') return;
                        if (actions[actionKey][property] !== self._actions[actionKey][property]) {
                            return callback(new utils.ConsistenceError(actionKey, property, null, actions[actionKey][property]));
                        }
                    })
                }
            })    

            callback();
        })
    }
    
    obj.getInterface = function(callback) {

        var self = this,
            actions = {},
            redis = this.getRedisClient();

        // Obtain the list of active workers
        redis.keys(this.config.prefix + '/' + this.ns + '/workers/*', function(err, keys){
            if (err) return callback(err);
            // If actions list is empty
            if (!keys.length) return callback(null, actions);

            // Obtain the info all each workers
            redis.mget(keys, function(err, workers){
                if (err) return callback(err);
                try {
                    // Parse each worker info
                    workers.map(JSON.parse).forEach(function(worker){
                        // aggregate actions
                        Object.keys(worker.actions).forEach(function(actionKey){
                            var action = worker.actions[actionKey];
                            if (!actions[actionKey]) {
                                actions[actionKey] = {
                                    id : action.id,
                                    name : action.name,
                                    synonsis : action.synopsis,
                                    threads : [],
                                    atomic : action.atomic,
                                    timeout : action.timeout,
                                    avgTime : {},
                                    workers : 0
                                };
                            }
                            // check interfqce consistence
                            if (actions[actionKey].atomic !== action.atomic) {
                                return callback(new utils.ConsistenceError(actionKey,
                                    'atomic', worker.name, actions[actionKey].atomic));
                            }
                            // aggregate
                            actions[actionKey].workers++;
                            actions[actionKey].threads.push(action.threads);
                            actions[actionKey].avgTime[worker.name] = action.avgTime;
                        })
                    });

                    callback(null, actions);
                }
                catch (err) {
                    return callback(err);
                }
            })
        });
    }
    
}
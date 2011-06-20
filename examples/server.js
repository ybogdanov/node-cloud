
var Cloud = require('../lib'),
    redis = require('redis');
    
//redis.debug_mode = true;

var config = {
    
    ns : 'test',
    
    redis : {
        host : '127.0.0.1',
        port : 6379
    },
    
    actions : {
        
        sum : function(a, b, callback) {
            
            console.log('sum() called with args: ', arguments);
            
            if (a > b) {
                return callback("a cannot be greater than b");
            }
            setTimeout(function(){
                callback(null, a + b);
            }, 1000)
        },
        
        sum2 : {
            
            threads : 10,
            atomic : true, // mutex/ this task is unique
            timeout : 10000, // overall timeout for the task
            
            fn : function(a, b, callback) {
                
                console.log('sum2() called with args: ', argments);
                
                if (a > b) {
                    return callback("a cannot be greater than b");
                }
                setTimeout(function(){
                    callback(null, a + b);
                }, 100)
            }
        }
    }
}


// Create two nodes
var worker = new Cloud.Worker(config);
worker.start();

worker.on('error', function(err){
    console.error('Cloud server error: ' + err);
})

console.log('Cloud server started at /%s/%s', worker.ns, worker.name);


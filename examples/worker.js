
var Cloud = require('../lib'),
    redis = require('redis');
    
//redis.debug_mode = true;

var config = {
    
    debug : true,
    
    actions : {
        
        ping : function(packet, callback) {
            callback(null, packet);
        },
        
        sum : function(a, b, callback) {
            if (a > b) {
                return callback("a cannot be greater than b");
            }
            setTimeout(function(){
                callback(null, a + b);
            }, 1000)
        },
        
        sum2 : {
            
            atomic : true,
            threads : 50,
            //timeout : 1000, // overall timeout for the task (for clients)
            
            fn : function(a, b, callback) {
                if (a > b) {
                    return callback("a cannot be greater than b");
                }
                setTimeout(function(){
                    callback(null, a + b);
                }, 2000)
            }
        }
    }
}


// Create cluster worker
var worker = new Cloud.Worker(config);

worker.on('error', function(err){
    console.error('Cloud worker error: ' + err.stack);
})

if (module.parent) {
    module.exports = worker;
}
else {
    worker.start();
    console.log('Cloud worker started at /%s/%s', worker.ns, worker.name);
    
    process.once('SIGINT', function(){
        console.log('SIGINT');
        process.once('SIGINT', function(){
            process.exit();
        })
        worker.shutdown(function(err){
            process.exit();
        })
    })
}

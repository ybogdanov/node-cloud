# node-cloud
Cloud computing with node.js and redis.
It's the first draft - TODO.

## server.js

    var Cloud = require('cloud');
    
    // Cloud worker - you can launch as many instances as you want within same namespace
    var worker = new Cloud.Worker({
        
        // current cloud namespace
        ns : 'test',
        redis : {
            host : '127.0.0.1',
            port : 6379
        },
        
        // The list of actions on the cloud
        actions : {

            sum : function(a, b, callback) {

                console.log('sum() called with args: ', arguments);

                if (a > b) {
                    return callback("a cannot be greater than b");
                }
                setTimeout(function(){
                    callback(null, a + b);
                }, 1000)
            }
        }
    })

    worker.start();

    worker.on('error', function(err){
        console.error('Cloud server error: ' + err);
    })

    console.log('Cloud server started at /%s/%s', worker.ns, worker.name);
    
## client.js

    var Cloud = require('cloud');
    
    // Cloud worker - you can launch as many instances as you want within same namespace
    var client = new Cloud.Client({
        // here we need just to specify namespace & redis connection params
        ns : 'test',
        redis : {
            host : '127.0.0.1',
            port : 6379
        },
    });
    
    // Wait when client will be connected and API will be ready
    client.ready(function(){
        // Simply call the function in the cloud
        client.sum(2, 2, function(err, result){
            if (err) return console.error(err);
            console.log('sum(): ', result);
        })
    })

## server.js output:
    
    $ node examples/server.js 
    Cloud server started at /test/localhost:5302
    sum() called with args:  { '0': 2, '1': 2, '2': [Function] }
    
## client.js output:

    $ node examples/client.js 
    sum():  4
    
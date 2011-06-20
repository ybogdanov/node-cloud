
var Cloud = require('../lib'),
    redis = require('redis');

var config = {
    
    ns : 'test',
    
    redis : {
        host : '127.0.0.1',
        port : 6379
    }
}

//redis.debug_mode = true;

var client = new Cloud.Client(config);

client.on('error', function(err){
    console.error('Cloud client error: ' + err.stack);
})

client.ready(function(){
    client.sum(2, 2, function(err, result){
        if (err) return console.error(err);
        console.log('sum(): ', result);
    })
})
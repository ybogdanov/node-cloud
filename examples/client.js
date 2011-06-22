
var Cloud = require('../lib'),
    redis = require('redis');

var config = {
    
    actions : {
        sum : {},
        sum2 : {
            atomic : true,
            //timeout : 1000
        }
    }
}

//redis.debug_mode = true;

var client = new Cloud.Client(config);

client.on('error', function(err){
    console.error('Cloud client error: ' + err.stack);
})

setInterval(function(){
    console.log('sum')
    client.sum2(2, 2);
    return;
    client.sum2(2, 2, function(err, result){
        if (err) return console.error(err.stack);
        console.log('sum(): ', result);
    })
}, 300)

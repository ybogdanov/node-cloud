
var Cloud = require('../');

var length = 64;
//var length = 1024 * 1024; // 1mb

// Create client
var client = new Cloud.Client({
    actions : {
        ping : {}
    }
});

client.on('error', function(err){
    console.error('Cloud client error: ' + err.stack);
})

// packet create 
var packet = '', n = 0;
for (var i = 0; i < length; i++) packet += 'a';

// start ping
setInterval(function(){
    
    var start = new Date;
    
    var createSeqFunction = function(n) {
        return function(){
            var ms = new Date - start;
            console.log('%d bytes from /cloud/%s: icmp_seq=%d time=%d ms', packet.length, client.ns, n, ms);
        }
    }
    
    client.ping(packet, createSeqFunction(n++));
    
}, 1000)
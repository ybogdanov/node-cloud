/**
 * Module dependencies.
 */

var cluster = require('cluster'),
    clusterize = require('../../').clusterize;

var proc = cluster()
    .use(cluster.pidfiles(__dirname + '/tmp/pids'))
    .use(cluster.cli())
    //.set('workers', 2)
    .set('socket path', __dirname + '/tmp')
    //.use(cluster.logger(__dirname + '/tmp/logs'))
    .start();

if (proc.isWorker) {
    
    var worker = clusterize(proc, require('../worker')).start();
    console.log('Cloud worker started at /%s/%s', worker.ns, worker.name);
    
}
else {
    console.log('Cloud server started');
}
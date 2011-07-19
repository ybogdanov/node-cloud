
module.exports = function(proc, worker) {
    
    /**
     * Inherit some options
     */
    
    worker.config.shutdownTimeout = proc.options.timeout;
    
    /**
     * Override some node-cluster Worker process events
     */

    function destroy() {
        worker.destroy(function(err){
            if (err) console.error(err.stack || err.message);
            process.exit();
        });
    }

    function close() {
        worker.shutdown(function(err){
            if (err) console.error(err.stack || err.message);
            process.exit();
        })
    }
    
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGQUIT');
    process.on('SIGINT', destroy);
    process.on('SIGTERM', destroy);
    process.on('SIGQUIT', close);
    
    /**
     * Delegate some events
     */

    worker.on('workerWaiting', function(actions){
        proc.call('workerWaiting', actions);
    })

    worker.on('workerTimeout', function(timeout){
        proc.call('workerTimeout', timeout);
    })
    
    return worker;
}
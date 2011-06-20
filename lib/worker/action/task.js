
function Task(action, id, args, callback) {
    
    this.action = action;
    this.id = id;
    this.args = args;
    this.callback = callback;
}

module.exports = Task;

const { randRange } = require("./libs/utils")
const fs = require('fs');
var GLOBAL = {
    config: require("./env.json"),

    /**
     * @returns {string}
     */
    getRandomIncNode: function() {
        let randNode = this.config.incFullnodes[randRange(this.config.incFullnodes.length)]
        console.log("Using node:", randNode);
        return this.config.incFullnodes[randRange(this.config.incFullnodes.length)]
    },
    writeStatus: function(content, callback = null) {
        if (!callback) {
            callback = function(err) {
                if (err) {
                    console.log(err);
                }
                console.log("The file was saved!");
            }
        }
        fs.writeFile(this.config.statusFile, content, 'utf8', callback)
    },
    loadStatus: function() {
        let n = 1
        var checkedHeights = { "0": n, "1": n, "2": n, "3": n, "4": n, "5": n, "6": n, "7": n }
        if (fs.existsSync(this.config.statusFile)) {
            console.log("!!! Loading existing state file !!!");
            var checkedHeights = require(`./${this.config.statusFile}`)
        }
        return checkedHeights
    }
}

module.exports = { GLOBAL }
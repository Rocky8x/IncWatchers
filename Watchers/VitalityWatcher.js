const { wait, ALERT } = require('../libs/utils');
const { incFullnodes } = require("../env.json");
const { IncNode } = require('../libs/IncNode');

const gap = 20
let ALERTMSG = {
    text: 'Vitality alert',
    fields: {
    }
}

async function checkIncFullnodeVitality(nodeUrl) {
    var node = new IncNode(nodeUrl)
    var blkchainInfo0 = await node.getLatestHeights()
    await wait(gap)
    var blkchainInfo1 = await node.getLatestHeights()
    let doAlert = false

    console.log("Vitality check:", nodeUrl);

    for (let shard in blkchainInfo0) {
        console.log("    Shard:", shard, blkchainInfo0[shard], "->", blkchainInfo1[shard]);
        if (blkchainInfo0[shard] >= blkchainInfo1[shard]) {
            doAlert = true
            ALERTMSG.fields[shard] = `Stuck @ ${blkchainInfo0[shard]}`
        }
    }
    (doAlert) ? ALERT(ALERTMSG) : null
}

async function main() {
    for (const node of incFullnodes) {
        checkIncFullnodeVitality(node)
    }
}

main()

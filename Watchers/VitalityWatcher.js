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
        for (let retry = 1; retry <= 5; retry++) {
            console.log("    Shard:", shard, blkchainInfo0[shard], "->", blkchainInfo1[shard]);
            if (blkchainInfo0[shard] >= blkchainInfo1[shard]) {
                doAlert = true
                ALERTMSG.text = 'Vitality alert: ' + nodeUrl
                ALERTMSG.fields[`chainID: ${shard}`] = `Stuck @ ${blkchainInfo0[shard]}`
            } else {
                doAlert = false
                break
            }
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

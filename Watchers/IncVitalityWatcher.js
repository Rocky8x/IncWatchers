const { wait, newAlert } = require('../libs/utils');
const { IncNode } = require('../libs/IncNode');
const { GLOBAL } = require('../global');

const gap = 20

async function checkIncFullnodeVitality(nodeUrl) {
    let alertMsg = newAlert("Vitality alert")
    var node = new IncNode(nodeUrl)
    try {
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
                    alertMsg.text = 'Vitality alert: ' + nodeUrl
                    alertMsg.fields[`chainID: ${shard}`] = `Stuck @ ${blkchainInfo0[shard]}`
                    blkchainInfo0 = await node.getLatestHeights()
                    await wait(gap)
                    blkchainInfo1 = await node.getLatestHeights()
                } else {
                    doAlert = false
                    break
                }
            }
        }
        (doAlert) ? alertMsg.alert() : null
    } catch (error) {
        alertMsg.fields["ERR"] = "Node seem to be down"
        alertMsg.alert()
    }
}

async function main() {
    for (const node of GLOBAL.config.incFullnodes) {
        checkIncFullnodeVitality(node)
    }
}

main()

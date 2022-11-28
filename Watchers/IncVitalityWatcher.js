const { wait, newAlert } = require('../libs/utils');
const { IncNode } = require('../libs/IncNode');
const { GLOBAL } = require('../global');

const gap = 20
async function checkIncFullnodeVitality(nodeUrl) {
    let alertMsg = newAlert().appendTitle(nodeUrl)
    var node = new IncNode(nodeUrl)
    try {
        var blkchainInfo0 = await node.getLatestHeights()
        await wait(gap)
        var blkchainInfo1 = await node.getLatestHeights()

        console.log("Vitality check:", nodeUrl);
        for (let shard in blkchainInfo0) {
            for (let retry = 1; retry <= 5; retry++) {
                console.log("    Shard:", shard, blkchainInfo0[shard], "->", blkchainInfo1[shard]);
                if (blkchainInfo0[shard] >= blkchainInfo1[shard]) {
                    let info = {}
                    info[`chainID: ${shard}`] = `Stuck @ ${blkchainInfo0[shard]}`
                    alertMsg.setInfo(info)
                    await wait(gap)
                    blkchainInfo1 = await node.getLatestHeights()
                } else {
                    alertMsg.clearInfo()
                    break
                }
            }
        }
        alertMsg.sendIf()
    } catch (error) {
        console.log(error)
        alertMsg.setInfo({ ERR: "Node seem to be down" })
        alertMsg.send()
    }
}

async function main() {
    for (const node of GLOBAL.config.incFullnodes) {
        checkIncFullnodeVitality(node)
    }
}

main()

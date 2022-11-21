const { GLOBAL } = require("../global");
const { IncNode } = require("../libs/IncNode");
const { wait, ALERT } = require("../libs/utils");

var gap = 20
let ALERTMSG = {
    text: 'Mempool seem to be stucked !!!',
    fields: {
    }
}
async function main() {
    var node = new IncNode(GLOBAL.getRandomIncNode())
    monitorDuration = 120
    let currentTxList = []

    while (monitorDuration > gap) {
        var mempoolTxList = await node.getTxListMemPool()
        console.log("Mempool:", mempoolTxList);
        if (mempoolTxList == currentTxList) {
            ALERTMSG.fields.fullnode = node.url
            ALERT(ALERTMSG)
        }
        txList = mempoolTxList
        await wait(gap)
        monitorDuration -= gap
    }
}

main()
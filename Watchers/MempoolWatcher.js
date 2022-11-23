const { GLOBAL } = require("../global");
const { IncNode } = require("../libs/IncNode");
const { wait, newAlert } = require("../libs/utils");

var gap = 20
async function main() {
    var node = new IncNode(GLOBAL.getRandomIncNode())
    monitorDuration = 120
    let currentTxList = []

    while (monitorDuration > gap) {
        var mempoolTxList = await node.getTxListMemPool()
        console.log("Mempool:", mempoolTxList);
        if (mempoolTxList == currentTxList) {
            let alert = newAlert().appendTitle("Mempool seem to be stucked !!!")
            alert.fields.fullnode = node.url
            alert.alert()
        }
        txList = mempoolTxList
        await wait(gap)
        monitorDuration -= gap
    }
}

main()
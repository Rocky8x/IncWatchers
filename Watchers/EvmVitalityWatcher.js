const Web3 = require('web3');
const { wait, newAlert } = require('../libs/utils');
const { GLOBAL } = require('../global');

const gap = 20

async function checkEvmFullnodeVitality(nodeUrl) {
    try {
        var evmNode = new Web3(nodeUrl)
        var blockNum0 = await evmNode.eth.getBlockNumber()
        await wait(gap)
        var blockNum1 = await evmNode.eth.getBlockNumber()

        for (let retry = 1; retry <= 5; retry++) {
            console.log("Checking:", nodeUrl);
            console.log(`    try ${retry}: ${blockNum0} -> ${blockNum1}`)
            if (blockNum0 >= blockNum1) {
                blockNum0 = await evmNode.eth.getBlockNumber()
                await wait(gap)
                blockNum1 = await evmNode.eth.getBlockNumber()
            } else {
                return {}
            }
        }
        let alert = {}
        alert[nodeUrl] = `Stucked @ ${blockNum0}`
        return alert
    } catch (error) {
        console.log(nodeUrl, error);
        let result = {}
        result[nodeUrl] = `Seem to be down`
        return result
    }
}

async function main() {
    let alertMsgs = []
    let alert = newAlert()

    const tasks = GLOBAL.config.evmFullnodes.map(async node => {
        let result = await checkEvmFullnodeVitality(node)
        alertMsgs.push(result)
    })
    await Promise.all(tasks)
    for (let msg of alertMsgs) { alert.addInfo(msg) }
    alert.sendIf()
}

main()
const fs = require('fs');
const axios = require("axios");
const SlackNotify = require('slack-notify');

const config = require("./env.json")
const slack = SlackNotify(config.webHookUrl);

const RPC_REQ = {
    url: config.fullnodeUrl, method: 'POST', headers: { 'Content-Type': 'application/json' },
    data: { jsonrpc: "1.0", id: 1, method: "", params: [] },
}

const moreResponseFunctions = {
    getBestHeights: function () {
        let bestHeights = {}
        for (let i in this.data.Result.BestBlocks) {
            bestHeights[i] = this.data.Result.BestBlocks[i].Height
            delete bestHeights["-1"]
        }
        return bestHeights
    },
    getMetadata: function () {
        try {
            return JSON.parse(this.data.Result.Metadata)
        } catch (error) {
            return { Type: 0 }
        }
    },
    getTxList: function () {
        return this.data.Result[0].TxHashes
    },
    getProof: function () {
        return { Privacy: this.data.Result.ProofDetail, Token: this.data.Result.PrivacyCustomTokenProofDetail }
    },
    getOutCoinAmounts: function () {
        let amount = {}
        let outCoins = {
            Privacy: this.data.Result.ProofDetail.OutputCoins,
            Token: this.data.Result.PrivacyCustomTokenProofDetail.OutputCoins
        }
        for (const key in outCoins) {
            amount[key] = 0
            let coins = (outCoins[key]) ? outCoins[key] : []
            for (const item of coins) {
                amount[key] += (item.Value - 0)
            }
        }
        return amount
    },
    getTokenId: function () {
        return this.data.Result.PrivacyCustomTokenID
    }
}

async function getShardBlockByHeight(shardID = 0, height = 0) {
    RPC_REQ.data.method = "retrieveblockbyheight"
    RPC_REQ.data.params = [height, shardID, "1"]
    let response = await axios(RPC_REQ)
    response.getTxList = moreResponseFunctions.getTxList
    return response
}

async function getTxByHash(txId) {
    RPC_REQ.data.method = "gettransactionbyhash"
    RPC_REQ.data.params = [txId]
    let response = await axios(RPC_REQ)
    response.getMetadata = moreResponseFunctions.getMetadata
    response.getProof = moreResponseFunctions.getProof
    response.getOutCoinAmounts = moreResponseFunctions.getOutCoinAmounts
    response.getTokenId = moreResponseFunctions.getTokenId
    return response
}

async function getBlockChainInfo() {
    RPC_REQ.data.method = "getblockchaininfo"
    RPC_REQ.data.params = []
    let response = await axios(RPC_REQ)
    response.getBestHeights = moreResponseFunctions.getBestHeights
    return response
}
/* ===================================================================== */
async function main() {
    // var checkedHeights = { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1 }
    let n = 2447800
    var checkedHeights = { "0": n, "1": n, "2": n, "3": n, "4": n, "5": n, "6": n, "7": n }

    if (fs.existsSync(config.statusFile)) {
        console.log("file exist");
        var checkedHeights = require(`./${config.statusFile}`)
    }
    process.on('SIGINT', function () {
        fs.writeFile(config.statusFile, JSON.stringify(checkedHeights, null, 3), 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("SIGINT caught! The file was saved! exit");
            process.exit()
        });
    })
    let blkchainInfo = await getBlockChainInfo()
    let bestHeights = blkchainInfo.getBestHeights()

    for (let shard in bestHeights) {
        for (var height = checkedHeights[shard]; height < bestHeights[shard]; height++) {
            console.log(`Checking shard${shard}@${height}`);
            let txlist = (await getShardBlockByHeight(shard - 0, height)).getTxList()
            checkedHeights[shard] = height
            for (tx of txlist) {
                try {
                    var result = await getTxByHash(tx)
                    checkedHeights[shard] = height - 1
                } catch (error) {
                    break
                }
                let amount = result.getOutCoinAmounts()
                let tokenId = result.getTokenId()
                let alertAmount = ((config.d6Tokens.includes(tokenId)) ? 10e6 : 10e9) * config.alertAmount
                let alertAmountPRV = config.alertAmount * 10e9
                if (amount.Privacy > alertAmountPRV || amount.Token > alertAmount) {
                    let alertMsg = {
                        text: 'Minting alert',
                        fields: {
                            TX: result.data.Result.Hash,
                            Metadata: result.getMetadata().Type,
                            PRV: amount.Privacy,
                            Token: `${amount.Token} (${tokenId})`
                        }
                    }
                    // slack.alert(alertMsg);
                    console.log(JSON.stringify(alertMsg, null, 3));
                }
            }
        }
        fs.writeFile(STATUS_FILE, JSON.stringify(checkedHeights, null, 3), 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });
    }
}


main()

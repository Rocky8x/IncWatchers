const fs = require('fs');
const axios = require("axios");
const SlackNotify = require('slack-notify');

const CONFIG = require("./env.json")
const METADATA = require("./metadata.json")
const SLACK = SlackNotify(CONFIG.webHookUrl);

function newRpcReq() {
    return {
        url: CONFIG.fullnodeUrl, method: 'POST', headers: { 'Content-Type': 'application/json' },
        data: { jsonrpc: "1.0", id: 1, method: "", params: [] }
    }
}

const moreResponseFunctions = {
    getResult: function () {
        if (typeof this.data.Result == "undefined") {
            console.log(this.data);
            throw "Result is undefined"
        }
        return this.data.Result
    },
    getBestHeights: function () {
        let bestHeights = {}
        for (let i in this.getResult().BestBlocks) {
            bestHeights[i] = this.getResult().BestBlocks[i].Height
            delete bestHeights["-1"]
        }
        return bestHeights
    },
    getMetadata: function () {
        try {
            return JSON.parse(this.getResult().Metadata)
        } catch (error) {
            return { Type: 0 }
        }
    },
    getTxList: function () {
        try {
            return this.getResult()[0].TxHashes
        } catch (err) {
            console.log(this.data)
            throw err
        }
    },
    getProof: function () {
        return { Privacy: this.getResult().ProofDetail, Token: this.getResult().PrivacyCustomTokenProofDetail }
    },
    getOutCoinAmounts: function () {
        let amount = {}
        let tokenId = this.getResult().PrivacyCustomTokenID
        let outCoins = {
            PRV: this.getResult().ProofDetail.OutputCoins
        }
        outCoins[tokenId] = this.getResult().PrivacyCustomTokenProofDetail.OutputCoins
        for (const key in outCoins) {
            amount[key] = 0
            let coins = (outCoins[key]) ? outCoins[key] : []
            for (const item of coins) {
                amount[key] += (item.Value - 0)
            }
        }
        return amount
    },
    getUsdPriceOfToken: function (tokenId) {
        for (var item of this.getResult()) {
            if (item.TokenID == tokenId) {
                return item.PriceUsd
            }
        }
        return 0
    },
    getDecOfToken: function (tokenId) {
        for (var item of this.getResult()) {
            if (item.TokenID == tokenId) {
                return item.PDecimals
            }
        }
        return 1
    },
    getTokenInfo: function (tokenId) {
        for (var item of this.getResult()) {
            if (item.TokenID == tokenId) {
                return `${item.Name} - ${item.Network}`
            }
        }
        return ""
    }
}

async function axiosRetry(req) {
    let retry = 0
    while (retry < 5) {
        try {
            var result = await axios(req)
            break
        } catch (error) {
            retry++
            console.log("! Retry", retry)
            if (retry == 0) { throw error }
        }
    }
    result.getResult = moreResponseFunctions.getResult
    return result
}

async function getCsCoinList() {
    let response = await axiosRetry({
        url: "https://api-coinservice.incognito.org/coins/tokenlist",
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
    })
    response.getUsdPriceOfToken = moreResponseFunctions.getUsdPriceOfToken
    response.getDecOfToken = moreResponseFunctions.getDecOfToken
    response.getTokenInfo = moreResponseFunctions.getTokenInfo
    return response
}

async function getShardBlockByHeight(shardID = 0, height = 0) {
    let req = newRpcReq()
    req.data.method = "retrieveblockbyheight"
    req.data.params = [height, shardID, "1"]
    var response = await axiosRetry(req)
    response.getTxList = moreResponseFunctions.getTxList
    return response
}

async function getTxByHash(txId) {
    let req = newRpcReq()
    req.data.method = "gettransactionbyhash"
    req.data.params = [txId]
    var response = await axiosRetry(req)
    response.getMetadata = moreResponseFunctions.getMetadata
    response.getProof = moreResponseFunctions.getProof
    response.getOutCoinAmounts = moreResponseFunctions.getOutCoinAmounts
    return response
}

async function getBlockChainInfo() {
    let req = newRpcReq()
    req.data.method = "getblockchaininfo"
    req.data.params = []
    let response = await axiosRetry(req)
    response.getBestHeights = moreResponseFunctions.getBestHeights
    return response
}

async function loadPreviewState() {
    let n = 1
    var checkedHeights = { "0": n, "1": n, "2": n, "3": n, "4": n, "5": n, "6": n, "7": n }
    if (fs.existsSync(CONFIG.statusFile)) {
        console.log("!!! Loading existing state file !!!");
        var checkedHeights = require(`./${CONFIG.statusFile}`)
    }

    let reCalShard = []
    for (let shardId in checkedHeights) {
        let height = checkedHeights[shardId]
        if (height < 0) { reCalShard.push(shardId) }
    }
    let bestHeights = (await getBlockChainInfo()).getBestHeights()
    for (let shardId of reCalShard) { checkedHeights[shardId] += bestHeights[shardId] }
    return checkedHeights
}

async function checkTxOfShardAtHeight(shard, height) {
    const csCoins = await getCsCoinList()
    let txlist = (await getShardBlockByHeight(shard - 0, height)).getTxList()
    for (tx of txlist) {
        var result = await getTxByHash(tx)
        let outcointAmount = result.getOutCoinAmounts()
        let outcoinValueUSD = {}
        let outcoinDecimal = {}
        for (let tokenId in outcointAmount) {
            let dec = csCoins.getDecOfToken(tokenId)
            outcoinValueUSD[tokenId] = (outcointAmount[tokenId] / (10 ** dec)) * csCoins.getUsdPriceOfToken(tokenId)
            outcoinDecimal[tokenId] = dec
        }

        let metaType = result.getMetadata().Type
        let alertMsg = {
            text: 'Minting alert',
            fields: {
                TX: result.getResult().Hash,
                Metadata: `#${metaType} ${METADATA[metaType]}`
            }
        }
        let doAlert = false
        for (let tokenId in outcoinValueUSD) {
            let value = outcoinValueUSD[tokenId]
            if (value > CONFIG.alertValueInUSD) {
                alertMsg.fields[csCoins.getTokenInfo(tokenId)] = `${tokenId}. `
                    + `Amount: ${(outcointAmount[tokenId] / (10 ** outcoinDecimal[tokenId])).toFixed(2)} `
                    + `(${outcoinValueUSD[tokenId].toFixed(2)} USD)`
                doAlert = true
            }
        }
        if (doAlert) {
            if (CONFIG.alertSlack) { SLACK.alert(alertMsg) }
            console.log(JSON.stringify(alertMsg, null, 3))
        }
    }
}
/* ===================================================================== */
async function main() {
    CONFIG
    var checkedHeights = await loadPreviewState()
    process.on('SIGINT', function () {
        fs.writeFile(CONFIG.statusFile, JSON.stringify(checkedHeights, null, 3), 'utf8', function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("SIGINT caught! The file was saved! exit");
            process.exit()
        });
    })
    let blkchainInfo = await getBlockChainInfo()
    let bestHeights = blkchainInfo.getBestHeights()
    let promises = []
    for (let shard in bestHeights) {
        console.log(`Processing Shard${shard}`)
        for (let height = checkedHeights[shard]; height < bestHeights[shard]; height++) {
            promises.push(checkTxOfShardAtHeight(shard, height))
            if (promises.length >= 1000) {
                await Promise.all(promises)
                console.log(`Processed 1000 blocks of Shard${shard}, now @ ${height}`)
                // console.log(JSON.stringify(checkedHeights, null, 3))
                promises = []
            }
            checkedHeights[shard] = height
        }
    }
    await Promise.all(promises)
    fs.writeFile(CONFIG.statusFile, JSON.stringify(checkedHeights, null, 3), 'utf8', function (err) {
        if (err) {
            return console.log(err);
        }
        console.log("The file was saved!");
    })
}

main()


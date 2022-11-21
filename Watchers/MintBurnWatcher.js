const fs = require('fs');
const axios = require("axios");
const METADATA = require("../metadata.json");
const { GLOBAL } = require('../global');
const { ALERT } = require('../libs/utils');
const SHARD_ERR = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] }
var randomNode = GLOBAL.config.incFullnodes.at(1)
function newRpcReq() {
    return {
        url: randomNode, method: 'POST', headers: { 'Content-Type': 'application/json' },
        data: { jsonrpc: "1.0", id: 1, method: "", params: [] }
    }
}

const moreResponseFunctions = {
    getResult: function() {
        if (typeof this.data.Result == "undefined") {
            console.log(this.data);
            throw "Result is undefined"
        }
        return this.data.Result
    },
    getBestHeights: function() {
        let bestHeights = {}
        for (let i in this.getResult().BestBlocks) {
            bestHeights[i] = this.getResult().BestBlocks[i].Height
            delete bestHeights["-1"]
        }
        return bestHeights
    },
    getMetadata: function() {
        try {
            return JSON.parse(this.getResult().Metadata)
        } catch (error) {
            return { Type: 0 }
        }
    },
    getTxList: function() {
        try {
            return this.getResult()[0].TxHashes
        } catch (err) {
            console.log(this.data)
            throw err
        }
    },
    getProof: function() {
        return { Privacy: this.getResult().ProofDetail, Token: this.getResult().PrivacyCustomTokenProofDetail }
    },
    getOutCoinAmounts: function() {
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
    getUsdPriceOfToken: function(tokenId) {
        for (var item of this.getResult()) {
            if (item.TokenID == tokenId) {
                return item.PriceUsd
            }
        }
        return 0
    },
    getDecOfToken: function(tokenId) {
        for (var item of this.getResult()) {
            if (item.TokenID == tokenId) {
                return item.PDecimals
            }
        }
        return 1
    },
    getTokenInfo: function(tokenId) {
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
            console.log(error.code)
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
    var checkedHeights = GLOBAL.loadStatus()

    let reCalShard = []
    for (let shardId in checkedHeights) {
        let height = checkedHeights[shardId]
        if (height < 0) { reCalShard.push(shardId) }
    }
    if (reCalShard) {
        let bestHeights = (await getBlockChainInfo()).getBestHeights()
        for (let shardId of reCalShard) { checkedHeights[shardId] += bestHeights[shardId] }
    }

    return checkedHeights
}

async function checkTxOfShardAtHeight(shard, height, csCoins) {
    try {
        var txlist = (await getShardBlockByHeight(shard - 0, height)).getTxList()
    } catch (error) {
        console.log(`Got trouble checking shard${shard} @ ${height}, rollback status for next rounnd`);
        SHARD_ERR[shard].push(height)
        throw error
    }
    for (tx of txlist) {
        try {
            var result = await getTxByHash(tx)
        } catch (error) {
            console.log(`Got trouble checking shard${shard} @ ${height}, tx: ${tx}, rollback status for next rounnd`);
            SHARD_ERR[shard].push(height)
            throw error
        }
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
            text: 'Minting/Burn alert',
            fields: {
                TX: result.getResult().Hash,
                Metadata: `#${metaType} ${METADATA[metaType]}`
            }
        }
        let doAlert = false
        for (let tokenId in outcoinValueUSD) {
            let value = outcoinValueUSD[tokenId]
            if (value > GLOBAL.config.alertValueInUSD) {
                alertMsg.fields[csCoins.getTokenInfo(tokenId)] = `${tokenId}. `
                    + `Amount: ${(outcointAmount[tokenId] / (10 ** outcoinDecimal[tokenId])).toFixed(2)} `
                    + `(${outcoinValueUSD[tokenId].toFixed(2)} USD)`
                doAlert = true
            }
        }
        (doAlert) ? ALERT(alertMsg) : null
    }
}
/* ===================================================================== */
async function main() {
    var checkedHeights = await loadPreviewState()
    var csCoins = await getCsCoinList()
    process.on('SIGINT', function() {
        console.log("SIGINT caught! Saving state.")
        GLOBAL.writeStatus(JSON.stringify(checkedHeights, null, 3), process.exit)
    })
    let blkchainInfo = await getBlockChainInfo()
    let bestHeights = blkchainInfo.getBestHeights()
    let promises = []
    for (let shard in bestHeights) {
        console.log(`Processing Shard${shard}`)
        for (let height = checkedHeights[shard]; height < bestHeights[shard]; height++) {
            if (SHARD_ERR[shard].length > 0) {
                console.log("Problem with previous height. skip ", height - 1, SHARD_ERR);
                break
            }
            promises.push(checkTxOfShardAtHeight(shard, height, csCoins))
            if (promises.length >= 1000) {
                await Promise.all(promises)
                console.log(`Processed 1000 blocks of Shard${shard}, now @ ${height}`)
                promises = []
            }
            checkedHeights[shard] = height
        }
    }
    await Promise.all(promises)
    for (let shard in checkedHeights) {
        SHARD_ERR[shard].push(checkedHeights[shard])
        checkedHeights[shard] = Math.min(...SHARD_ERR[shard])
    }
    GLOBAL.writeStatus(JSON.stringify(checkedHeights, null, 3))
}

main()


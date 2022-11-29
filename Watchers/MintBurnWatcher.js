const METADATA = require("../metadata.json");
const { GLOBAL } = require('../global');
const { newAlert, axiosRetry } = require('../libs/utils');
const { IncNode } = require("../libs/IncNode");

const SHARD_ERR = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] }
const FULLNODE = new IncNode(GLOBAL.getRandomIncNode())
const TOKEN_LIST_URL = 'https://api-coinservice.incognito.org/coins/tokenlist'

async function getCsCoinList() {
    let response = await axiosRetry({
        url: TOKEN_LIST_URL,
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
    })

    return {
        ...response,
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
}

async function loadPreviewState() {
    var checkedHeights = GLOBAL.loadStatus()

    let reCalShard = []
    for (let shardId in checkedHeights) {
        let height = checkedHeights[shardId]
        if (height < 0) { reCalShard.push(shardId) }
    }
    if (reCalShard) {
        let bestHeights = (await FULLNODE.rpcGetBlkChainInfo()).getBestHeights()
        for (let shardId of reCalShard) { checkedHeights[shardId] += bestHeights[shardId] }
    }
    return checkedHeights
}

async function checkTxOfShardAtHeight(shard, height, csCoins) {
    try {
        var txlist = (await FULLNODE.rpcGetShardBlockByHeight(shard - 0, height)).getTxList()
    } catch (error) {
        console.log(`Got trouble checking shard${shard} @ ${height}, roll back status for next round`);
        SHARD_ERR[shard].push(height)
        throw error
    }
    for (let tx of txlist) {
        try {
            var result = await FULLNODE.rpcGetTxByHash(tx)
        } catch (error) {
            console.log(`Got trouble checking shard${shard} @ ${height}, tx: ${tx}, roll back status for next round`);
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
        let alert = newAlert()
        alert.addInfo({
            TX: result.getResult().Hash,
            Metadata: `#${metaType} ${METADATA[metaType]}`
        })

        let doAlert = false
        for (let tokenId in outcoinValueUSD) {
            let value = outcoinValueUSD[tokenId]
            if (value > GLOBAL.config.alertValueInUSD) {
                let moreInfo = {}
                moreInfo[csCoins.getTokenInfo(tokenId)] = `${tokenId}. `
                    + `Amount: ${(outcointAmount[tokenId] / (10 ** outcoinDecimal[tokenId])).toFixed(2)} `
                    + `(${outcoinValueUSD[tokenId].toFixed(2)} USD)`
                alert.addInfo(moreInfo)
                doAlert = true
            }
        }
        (doAlert) ? alert.send() : null
    }
}
/* ===================================================================== */
async function main() {
    var checkedHeights = await loadPreviewState()
    try {
        var csCoins = await getCsCoinList()
    } catch (error) {
        let alert = newAlert("Error while get token list")
        alert.addInfo({ DOWN: TOKEN_LIST_URL })
        alert.send()
        console.log(error);
        process.exit(1)
    }
    process.on('SIGINT', function() {
        console.log("SIGINT caught! Saving state.")
        GLOBAL.writeStatus(JSON.stringify(checkedHeights, null, 3), process.exit)
    })
    let blkchainInfo = await FULLNODE.rpcGetBlkChainInfo()
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
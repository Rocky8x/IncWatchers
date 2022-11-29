const { axiosRetry } = require("./utils")

class IncNode {
    constructor(url) {
        this.url = url
    }

    async rpcCall(method, params = []) {
        let req = {
            url: this.url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { jsonrpc: "1.0", id: 1, params: params, method: method },
        }
        return await axiosRetry(req)
    }

    async rpcGetBlkChainInfo() {
        let response = await this.rpcCall("getblockchaininfo")
        return { ...response, ...getBlockChainInfoMethod }
    }

    async rpcGetMemPool() {
        return await this.rpcCall("getmempoolinfo")
    }

    async rpcGetTxByHash(txId) {
        let response = await this.rpcCall("gettransactionbyhash", [txId])
        return { ...response, ...getTxByHashMethods }
    }

    /**
     *
     * @param {number} shardID
     * @param {number} height
     * @returns {object}: AxioResponse , getTxList
     */
    async rpcGetShardBlockByHeight(shardID = 0, height = 0) {
        let response = await this.rpcCall("retrieveblockbyheight", [height, shardID, "1"])
        return { ...response, ...rpcGetShardBlockByHeightMethod }
    }

    async getLatestHeights() {
        let blkInfo = await this.rpcGetBlkChainInfo()
        let heights = {}
        for (let shard in blkInfo.data.Result.BestBlocks) {
            heights[shard] = blkInfo.data.Result.BestBlocks[shard].Height
        }
        return heights
    }

    async getTxListMemPool() {
        return (await this.rpcGetMemPool()).data.Result.ListTxs
    }
}

const getTxByHashMethods = {
    getMetadata: function() {
        try {
            return JSON.parse(this.getResult().Metadata)
        } catch (error) {
            return { Type: 0 }
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
}

const getBlockChainInfoMethod = {
    getBestHeights: function() {
        let bestHeights = {}
        for (let i in this.getResult().BestBlocks) {
            bestHeights[i] = this.getResult().BestBlocks[i].Height
            delete bestHeights["-1"]
        }
        return bestHeights
    },
}
const rpcGetShardBlockByHeightMethod = {
    getTxList: function() {
        try {
            return this.getResult()[0].TxHashes
        } catch (err) {
            console.log(this.data)
            throw err
        }
    },
}

module.exports = { IncNode }
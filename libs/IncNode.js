const { axiosRetry } = require("./utils")


class IncNode {
    constructor(url) {
        this.url = url
    }

    async rpcCall(method, params = []) {
        let req = {
            url: this.url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
            data: { jsonrpc: "1.0", id: 1, params: params, method: method },
            'decompress': true
        }
        return await axiosRetry(req)
    }

    async rpcGetBlkChainInfo() {
        return await this.rpcCall("getblockchaininfo")
    }

    async rpcGetMemPool() {
        return await this.rpcCall("getmempoolinfo")
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

module.exports = { IncNode }
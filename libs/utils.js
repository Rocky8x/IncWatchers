const SlackNotify = require('slack-notify');
const axios = require("axios")
function wait(second) {
    return new Promise(resolve => setTimeout(resolve, second * 1000));
}

function newAlert(title = "Alert") {
    let alertObj = {
        content: {
            text: title,
            fields: {}
        },
        alert: function() {
            const { GLOBAL } = require('../global');
            const SLACK = SlackNotify(GLOBAL.config.webHookUrl);
            console.log("!!! ALERT:", this.content)
            if (GLOBAL.config.alertSlack) { SLACK.alert(this.content) }
        },
        addInfo: function(info) {
            this.content.fields = { ...this.content.fields, ...info }
            return this
        },
        setInfo: function(info) {
            this.content.fields = info
            return this
        }
    }
    return alertObj
}

async function axiosRetry(req) {
    let retry = 0
    while (retry < 5) {
        try {
            var result = await axios(req)
            break
        } catch (error) {
            retry++
            console.log(error.code);
            console.log("! Retry", retry, req)
            if (retry == 0) { throw error }
        }
    }
    return result
}

function randRange() {
    if (arguments.length >= 2) {
        var max = arguments[1]
        var min = arguments[0]
    } else if (arguments.length == 1) {
        var max = arguments[0]
        var min = 0
    } else {
        throw new Error("Expect 1 or 2 arguments while got", arguments.length)
    }
    return Math.floor(Math.random() * max) + min
}

module.exports = { wait, axiosRetry, randRange, newAlert }
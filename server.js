const Binance = require("node-binance-api");
const fs = require("fs");
const express = require("express");
const app = express();
const { newInterval, wait } = require("./utils/run");

// 加载.env文件
const dotenv = require("dotenv");
dotenv.config();

// 其他配置文件
const configs = require("./configs/config.json");
const symbolList = configs.symbolList;

let currBalances = {};
let currPrices = {};
// 初始化 cex client
const binance = new Binance().options({
    APIKEY: process.env.BN_KEY,
    APISECRET: process.env.BN_SECRET,
    family: 4,
    useServerTime: true,
    recvWindow: 10000,
});

// 定时更新cex的仓位, API更新
const updateBalances = async () => {
    await binance.useServerTime();
    binance.balance((error, balances) => {
        if (error) {
            return console.error(error);
        }
        symbolList.map((symbol) => {
            for (let token in balances) {
                if (token + "USDT" == symbol) {
                    currBalances[symbol] = parseFloat(
                        balances[token].available
                    );
                }
            }
        });
        // console.log(currBalances);
    });
};

// 定时更新cex的价格，websocket更新
const updatePrices = async () => {
    await binance.useServerTime();
    symbolList.map((symbol) => {
        binance.websockets.bookTickers(symbol, (bookticker) => {
            currPrices[symbol] = {
                bid: parseFloat(bookticker.bestBid),
                ask: parseFloat(bookticker.bestAsk),
            };
            // console.log(currPrices);
        });
    });
};

// 处理价格
const trade = async (symbol, delta) => {
    const balance = currBalances[symbol];
    const price = currPrices[symbol];
    console.log(balance, price);
    // 如果当前有仓位，并且预测是涨
    if (balance > 0.001)
    // abs(diff) < 最小交易量，平仓，重新购买
    // diff > 0, 平掉利润
    // diff < 0, 补齐仓位
    // 如果当前有仓位，并且预测是跌
    // 平仓
    // 如果当前没仓位，预测是涨
    // 开仓
    // 如果当前没仓位，预测是跌
    // 什么也不做
};

const main = async () => {
    newInterval(updateBalances, 5000);
    await updatePrices();

    app.get("/api/v1/ml", async (req, res) => {
        if (req.query === null || req.query.delta === null) {
            res.json({ status: 0, message: "invalid parameters" });
        }
        const symbol = req.query.symbol;
        const delta = req.query.delta;

        await trade(symbol, delta);
        res.json({
            status: 1,
            message: "OK",
        });
    });

    // Listen to the App Engine-specified port, or 8080 otherwise
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}...`);
    });
};
main();

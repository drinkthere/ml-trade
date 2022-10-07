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
const symbolConf = configs.symbolConf;

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
    return new Promise((resolve, reject) => {
        binance.balance((error, balances) => {
            if (error) {
                return console.error(error);
            }
            symbolList.map((symbol) => {
                for (let token in balances) {
                    if (token == "BUSD") {
                        currBalances["BUSD"] = parseFloat(
                            balances[token].available
                        );
                    } else if (token + "BUSD" == symbol) {
                        currBalances[symbol] = parseFloat(
                            balances[token].available
                        );
                    }
                }
            });
            // console.log(currBalances);
            resolve();
        });
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
    try {
        const busdBalance = currBalances["BUSD"];
        const balance = currBalances[symbol];
        const price = currPrices[symbol];
        const conf = symbolConf[symbol];
        console.log(symbol, balance, price, busdBalance, conf);
        // 如果当前有仓位
        if (balance > conf.minBaseAmount) {
            if (delta == 1) {
                // 预测是涨
                const positionAmount = balance * price["bid"];
                const diff = positionAmount - conf.quoteAmount;
                if (Math.abs(diff) < conf.minQuoteAmount) {
                    // abs(diff) < 最小交易量，平仓，重新购买
                    await orderByBase("SELL", symbol, balance, conf);

                    // 如果 BUSD 余额不够quoteAmount 的话，就用当前余额下单
                    await updateBalances();
                    const quoteAmount = Math.min(
                        conf.quoteAmount,
                        currBalances["BUSD"]
                    );
                    await orderByQuote("BUY", symbol, quoteAmount, conf);
                } else if (diff > 0) {
                    // diff > 0, 平掉diff
                    await orderByQuote("SELL", symbol, diff, conf);
                } else if (diff < 0) {
                    // diff < 0, 补齐diff
                    if (busdBalance > Math.abs(diff)) {
                        await orderByQuote("BUY", symbol, Math.abs(diff), conf);
                    }
                }
            } else {
                // 预测是跌
                // 平仓
                await orderByBase("SELL", symbol, balance, conf);
            }
        } else {
            if (delta == 1) {
                // 如果当前没仓位，预测是涨
                // 开仓
                const quoteAmount = Math.min(conf.quoteAmount, busdBalance);
                await orderByQuote("BUY", symbol, quoteAmount, conf);
            } else {
                // 如果当前没仓位，预测是跌
                // 什么也不做
            }
        }
        return { status: 1, message: "OK" };
    } catch (e) {
        console.log(e.body);
        return { status: 0, message: e.body };
    }
};

const orderByQuote = async (direction, symbol, quoteAmount, conf) => {
    console.log("===Quote", direction, symbol, quoteAmount);
    // 处理 quoteAmount
    const quantity =
        Math.floor(quoteAmount * Math.pow(10, conf.quoteDecimal)) /
        Math.pow(10, conf.quoteDecimal);
    console.log("===Quote", direction, symbol, quantity);
    if (quantity < conf.minQuoteAmount) {
        return;
    }

    if (direction == "BUY") {
        await binance.marketBuy(symbol, 0, {
            type: "MARKET",
            quoteOrderQty: quantity,
        });
    } else if (direction == "SELL") {
        await binance.marketSell(symbol, 0, {
            type: "MARKET",
            quoteOrderQty: quantity,
        });
    }
};
const orderByBase = async (direction, symbol, baseAmount, conf) => {
    console.log("===Base", direction, symbol, baseAmount);
    // 处理 baseAmount
    const quantity =
        Math.floor(baseAmount * Math.pow(10, conf.baseDecimal)) /
        Math.pow(10, conf.baseDecimal);

    console.log("===Base", direction, symbol, quantity);
    if (quantity < conf.minBaseAmount) {
        return;
    }

    if (direction == "BUY") {
        await binance.marketBuy(symbol, quantity);
    } else if (direction == "SELL") {
        await binance.marketSell(symbol, quantity);
    }
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

        const response = await trade(symbol, delta);
        res.json(response);
    });

    // Listen to the App Engine-specified port, or 8080 otherwise
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}...`);
    });
};
main();

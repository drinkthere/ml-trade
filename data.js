const Binance = require("node-binance-api");
const fs = require("fs");
const { newInterval, wait } = require("./utils/run");

// 加载.env文件
const dotenv = require("dotenv");
dotenv.config();

// 其他配置文件
const configs = require("./configs/config.json");
const symbol = configs.symbol;
const miniuteTradingFilePath = __dirname + "/" + configs.miniuteTradingFilePath;

// 初始化 cex client
const binance = new Binance().options({
  APIKEY: process.env.BN_KEY,
  APISECRET: process.env.BN_SECRET,
});

const startWS = () => {
  // 监听币安trading消息
  binance.websockets.aggTrades([symbol], (tradingInfo) => {
    processData(tradingInfo);
  });
};

/*
{
  eventType: 'aggTrade',
  eventTime: 1662188808331,
  symbol: 'ETHUSDT',
  aggTradeId: 1043313768,
  price: '1563.10',
  amount: '2.127',
  total: 3324.7136999999993,
  firstTradeId: 2175459715,
  lastTradeId: 2175459716,
  timestamp: 1662188808220,
  maker: false
}
{
  "e": "trade",     // 事件类型
  "E": 123456789,   // 事件时间
  "s": "BNBBTC",    // 交易对
  "t": 12345,       // 交易ID
  "p": "0.001",     // 成交价格
  "q": "100",       // 成交数量
  "b": 88,          // 买方的订单ID
  "a": 50,          // 卖方的订单ID
  "T": 123456785,   // 成交时间
  "m": true,        // 买方是否是做市方。如true，则此次成交是一个主动卖出单，否则是一个主动买入单。
  "M": true         // 请忽略该字段
}
*/
const processData = async (tradingInfo) => {
  var ts = new Date().getTime();
  const timestamp = tradingInfo["T"];
  const file = miniuteTradingFilePath + Math.floor(timestamp / 60);
  const info = {
    symbol: tradingInfo["s"],
    price: tradingInfo["p"],
    amount: tradingInfo["q"],
    total: parseFloat(tradingInfo["p"]) * parseFloat(tradingInfo["q"]),
    timestamp: tradingInfo["T"],
  };
  console.log(ts, timestamp, timestamp - ts);
};

const main = async () => {
  startWS();
};
main();

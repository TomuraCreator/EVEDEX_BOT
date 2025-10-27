const evedexSdk = require("@evedex/exchange-bot-sdk");
const { WebSocket } = require("ws");
require("dotenv").config();

class VolumeBot {
    constructor() {
        this.environment = process.env.ENVIRONMENT || "DEMO";
        this.privateKey = process.env.PRIVATE_KEY;
        this.apiKey = process.env.API_KEY || null;
        this.instrument = process.env.INSTRUMENT || "BTCUSD:DEMO";
        this.orderSize = parseFloat(process.env.ORDER_SIZE || "0.001");
        this.cashQuantity = parseFloat(process.env.CASH_QUANTITY || "0");
        this.leverage = parseInt(process.env.LEVERAGE || "5");
        this.tradeDelayMs = parseInt(process.env.TRADE_DELAY_MS || "2000");
        this.maxTrades = parseInt(process.env.MAX_TRADES || "0");

        this.container = null;
        this.botWallet = null;
        this.gateway = null;
        this.balance = null;
        this.tradesExecuted = 0;
        this.isRunning = false;
        this.totalVolume = 0;
    }

    async init() {
        console.log("🚀 Initializing Evedex Volume Bot...");
        console.log(`Environment: ${this.environment}`);
        console.log(`Instrument: ${this.instrument}`);
        console.log(`Order Size: ${this.orderSize}`);
        console.log(`Cash Quantity: ${this.cashQuantity > 0 ? this.cashQuantity + ' USDT' : 'Using quantity'}`);
        console.log(`Leverage: ${this.leverage}x`);
        console.log(`Trade Delay: ${this.tradeDelayMs}ms`);
        console.log("━".repeat(50));

        if (!this.privateKey) {
            throw new Error("PRIVATE_KEY not found in .env file");
        }

        // Initialize container
        const config = {
            centrifugeWebSocket: WebSocket,
            wallets: {
                mainWallet: {
                    privateKey: this.privateKey,
                },
            },
            apiKeys: {},
        };

        // Add API key if provided
        if (this.apiKey) {
            config.apiKeys.mainApiKey = { apiKey: this.apiKey };
        }

        if (this.environment === "DEMO") {
            this.container = new evedexSdk.DemoContainer(config);
        } else {
            this.container = new evedexSdk.ProdContainer(config);
        }

        // Create WalletAccount properly
        if (this.apiKey) {
            // If API key is provided, use it to get account info
            const apiKeyAccount = await this.container.apiKeyAccount("mainApiKey");
            this.botWallet = new evedexSdk.WalletAccount({
                gateway: apiKeyAccount.gateway,
                wallet: this.container.wallet("mainWallet"),
                exchangeAccount: await apiKeyAccount.fetchMe(),
            });
        } else {
            // Otherwise use direct wallet account
            const tempAccount = await this.container.account("mainWallet");
            this.botWallet = new evedexSdk.WalletAccount({
                gateway: tempAccount.gateway,
                wallet: this.container.wallet("mainWallet"),
                exchangeAccount: await tempAccount.fetchMe(),
            });
        }

        this.gateway = this.container.gateway();
        this.balance = this.botWallet.getBalance();

        // Subscribe to balance updates
        await this.balance.listen();
        console.log("✅ Balance subscription active");

        // Set up position with leverage
        await this.setupPosition();

        // Get current balance
        const availableBalance = this.balance.getAvailableBalance();
        console.log(`💰 Available Balance: ${availableBalance.availableBalance} USDT`);
        console.log("━".repeat(50));
    }

    async setupPosition() {
        try {
            await this.botWallet.updatePosition({
                instrument: this.instrument,
                leverage: this.leverage,
            });
            console.log(`⚙️  Position leverage set to ${this.leverage}x`);
        } catch (error) {
            console.error("❌ Error setting position leverage:", error.message);
        }
    }

    async getCurrentPrice() {
        try {
            const depth = await this.gateway.fetchMarketDepth({
                instrument: this.instrument,
                maxLevel: 1,
            });

            if (depth && depth.bids && depth.bids.length > 0 && depth.asks && depth.asks.length > 0) {
                return {
                    bid: depth.bids[0].price,
                    ask: depth.asks[0].price,
                    mid: (depth.bids[0].price + depth.asks[0].price) / 2,
                };
            }

            const trades = await this.gateway.fetchTrades({
                instrument: this.instrument,
                limit: 1
            });

            if (trades && trades.length > 0) {
                const lastPrice = trades[0].price;
                return {
                    bid: lastPrice,
                    ask: lastPrice,
                    mid: lastPrice,
                };
            }

            throw new Error("No market data available");
        } catch (error) {
            console.error("❌ Error fetching market price:", error.message);
            return null;
        }
    }

    async executeBuyOrder() {
        try {
            console.log(`📈 Executing BUY order...`);
            const price = this.lastPrice || await this.getCurrentPrice();

            if (!price) {
                throw new Error("No price available for order");
            }

            const orderPayload = {
                instrument: this.instrument,
                side: evedexSdk.Side.Buy,
                leverage: this.leverage,
                timeInForce: evedexSdk.TimeInForce.IOC,
                cashQuantity: 1000
            };
            //
            // if (this.cashQuantity > 0) {
            //     orderPayload.cashQuantity = this.cashQuantity.toFixed(6);
            // } else {
            //     orderPayload.cashQuantity = (this.orderSize * price.mid).toFixed(6);
            // }

            console.log(orderPayload)

            const order = await this.botWallet.createMarketOrderV2(orderPayload);

            console.log(`✅ BUY order executed: ${order.id}`);
            return order;
        } catch (error) {
            console.error(`❌ BUY order failed: ${error.message}`);
            if (error.response?.data) {
                console.error("Error details:", JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    async executeSellOrder() {
        try {
            console.log(`📉 Executing SELL order...`);

            const orderPayload = {
                instrument: this.instrument,
                side: evedexSdk.Side.Sell,
                leverage: this.leverage,
                timeInForce: evedexSdk.TimeInForce.IOC,
                cashQuantity: 1000
            };

            const order = await this.botWallet.createMarketOrderV2(orderPayload);

            console.log(`✅ SELL order executed: ${order.id}`);
            return order;
        } catch (error) {
            console.error(`❌ SELL order failed: ${error.message}`);
            if (error.response?.data) {
                console.error("Error details:", JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    async executeTradeCycle() {
        const startTime = Date.now();

        try {
            // Get current price for logging
            const price = await this.getCurrentPrice();
            if (!price) {
                console.warn("⚠️  Skipping cycle - no market price available");
                return;
            }

            console.log(`💹 Current price: ${price.mid.toFixed(2)} (Bid: ${price.bid}, Ask: ${price.ask})`);

            // Execute BUY
            await this.executeBuyOrder();

            // Small delay between buy and sell
            await this.sleep(500);

            // Execute SELL
            await this.executeSellOrder();

            this.tradesExecuted++;

            // Calculate volume
            let cycleVolume;
            if (this.cashQuantity > 0) {
                cycleVolume = this.cashQuantity * 2; // Buy + Sell in cash terms
            } else {
                cycleVolume = this.orderSize * price.mid * 2; // Buy + Sell
            }
            this.totalVolume += cycleVolume;

            const elapsed = Date.now() - startTime;
            console.log(`✨ Trade cycle #${this.tradesExecuted} completed in ${elapsed}ms`);
            console.log(`📊 Total volume generated: ${this.totalVolume.toFixed(2)} USDT`);
            console.log("━".repeat(50));

            // Check positions
            const positions = this.balance.getPositionList();
            if (positions.length > 0) {
                console.log(`⚠️  Open positions: ${positions.length}`);
                positions.forEach(pos => {
                    console.log(`   ${pos.instrument}: ${pos.side} ${pos.quantity} @ ${pos.avgPrice}`);
                });
            }

        } catch (error) {
            console.error("❌ Trade cycle failed:", error.message);
            if (error.stack) {
                console.error("Stack:", error.stack);
            }
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async start() {
        this.isRunning = true;
        console.log("🤖 Bot started! Generating trading volume...");
        console.log("━".repeat(50));

        while (this.isRunning) {
            await this.executeTradeCycle();

            // Check if we've reached max trades
            if (this.maxTrades > 0 && this.tradesExecuted >= this.maxTrades) {
                console.log(`✅ Reached maximum trades (${this.maxTrades}). Stopping bot.`);
                break;
            }

            // Wait before next cycle
            await this.sleep(this.tradeDelayMs);
        }

        await this.stop();
    }

    async stop() {
        this.isRunning = false;
        console.log("━".repeat(50));
        console.log("🛑 Bot stopped");
        console.log(`📊 Total trades executed: ${this.tradesExecuted}`);
        console.log(`📊 Total volume generated: ${this.totalVolume.toFixed(2)} USDT`);

        if (this.container) {
            this.container.closeWsConnection();
            console.log("🔌 WebSocket connection closed");
        }

        process.exit(0);
    }
}

// Main execution
const bot = new VolumeBot();

// Handle graceful shutdown
process.on("SIGINT", async () => {
    console.log("\n⚠️  Received SIGINT signal. Shutting down gracefully...");
    await bot.stop();
});

process.on("SIGTERM", async () => {
    console.log("\n⚠️  Received SIGTERM signal. Shutting down gracefully...");
    await bot.stop();
});

// Start the bot
bot.init()
    .then(() => bot.start())
    .catch((error) => {
        console.error("❌ Fatal error:", error);
        if (error.stack) {
            console.error("Stack:", error.stack);
        }
        process.exit(1);
    });
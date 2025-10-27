# Evedex Volume Bot

Automated trading bot for generating trading volume on the Evedex exchange. The bot executes sequential buy-sell cycles using market orders to increase trading volume.

## Features

- 🔄 Automatic buy-sell trading cycles
- ⚙️ Configurable parameters via `.env` file
- 📊 Real-time trading volume tracking
- 🛡️ Graceful shutdown handling
- 📈 Support for demo and production environments
- 💰 Real-time balance monitoring via WebSocket
- ⚡ Configurable delays between trades
- 📡 WebSocket market data subscription with REST API fallback

## Installation

1. Clone the project and install dependencies:

```bash
npm install
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

3. Configure the parameters in `.env`:

```env
ENVIRONMENT=DEMO
PRIVATE_KEY=0x...
INSTRUMENT=BTCUSD:DEMO
ORDER_SIZE=0.001
CASH_QUANTITY=0
LEVERAGE=5
TRADE_DELAY_MS=2000
MAX_TRADES=0
```

## Configuration Parameters

- `ENVIRONMENT` - Exchange environment (`DEMO` or `PROD`)
- `PRIVATE_KEY` - Your wallet private key (starts with `0x`)
- `API_KEY` - Optional API key for read-only operations (starts with `v2:`)
- `INSTRUMENT` - Trading pair (e.g., `BTCUSD:DEMO`)
- `ORDER_SIZE` - Order size in base currency (e.g., 0.001 BTC)
- `CASH_QUANTITY` - Order size in USDT (set to 0 to use ORDER_SIZE instead)
- `LEVERAGE` - Leverage multiplier (1-125)
- `TRADE_DELAY_MS` - Delay between cycles in milliseconds (minimum 1000)
- `MAX_TRADES` - Maximum number of trade cycles (0 = unlimited)

## Running the Bot

Start the bot:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Stopping the Bot

Use `Ctrl+C` to gracefully stop the bot. It will complete the current cycle and display statistics.

## Logs

The bot outputs detailed information about each operation:

- ✅ Successful order execution
- ❌ Order execution failures
- 💹 Current market prices
- 📊 Accumulated trading volume
- ⚠️ Open positions
- 📡 Market data subscription status

## Example Output

```
🚀 Initializing Evedex Volume Bot...
Environment: DEMO
Instrument: BTCUSD:DEMO
Order Size: 0.001
Cash Quantity: Using quantity
Leverage: 5x
Trade Delay: 2000ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Balance subscription active
📊 Market data subscription active for BTCUSD:DEMO
⚙️  Position leverage set to 5x
💰 Available Balance: 998 USDT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Bot started! Generating trading volume...
✅ Market data received. Starting trades...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💹 Current price: 115239.35 (Bid: 115220.7, Ask: 115258)
📈 Executing BUY order...
✅ BUY order executed: a6f1c4e5-3b7d-42e6-b6b3-a4c65a6d43e6
📉 Executing SELL order...
✅ SELL order executed: b7g2d5f6-4c8e-53f7-c7c4-b5d76b7e54f7
✨ Trade cycle #1 completed in 1523ms
📊 Total volume generated: 230.48 USDT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Important Notes

### Demo Environment (Recommended for Testing)

For testing purposes, use the demo environment:
1. Register at https://demo-exchange.evedex.com
2. Request test funds via "Request Demo Funds" button
3. Use instruments with `:DEMO` suffix (e.g., `BTCUSD:DEMO`)

### Production Usage

⚠️ **WARNING**: Use at your own risk in production environment:
- Start with minimal `ORDER_SIZE`
- Set reasonable `MAX_TRADES` limit
- Monitor balance and fees carefully
- Understand spread implications (bid/ask difference)
- Account for exchange fees

### Position Management

The bot automatically:
- Sets leverage for the trading pair
- Executes market orders (IOC - Immediate-Or-Cancel)
- Tracks open positions in real-time
- Closes positions after each cycle

**Note**: Due to spreads and execution timing, small residual positions may remain. Monitor them in the UI or add logic to automatically close all positions.

## How It Works

1. **Initialization** - Connects to Evedex via SDK and subscribes to WebSocket updates
2. **Market Data Subscription** - Listens for real-time bid/ask quotes via WebSocket
3. **Position Setup** - Sets leverage for the trading pair
4. **Trading Loop**:
   - Waits for market data (up to 30 seconds)
   - Gets current bid/ask prices
   - Executes market BUY order
   - Waits 500ms
   - Executes market SELL order
   - Records cycle statistics
   - Waits `TRADE_DELAY_MS` before next cycle

### Order Execution

- Uses `createMarketOrderV2` method for market orders
- Requires `cashQuantity` parameter (calculated from quantity × price if needed)
- Uses `TimeInForce.IOC` (Immediate-Or-Cancel)
- Automatic position leverage management

### Volume Calculation

```
Cycle Volume = Order Size × Price × 2 (Buy + Sell)
```

## Project Structure

```
evedex-volume-bot/
├── index.js              # Main bot implementation
├── package.json          # Dependencies
├── .env.example          # Configuration template
├── .env                  # Your configuration (not committed)
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## Technical Details

### Dependencies

- `@evedex/exchange-bot-sdk` - Official Evedex SDK
- `ws` - WebSocket client for real-time data
- `dotenv` - Environment variable management

### Market Data Strategy

The bot uses a multi-layer approach for market data:

1. **Primary**: WebSocket subscription to order book best (`OrderBookBest`)
   - Real-time bid/ask updates
   - Cached for fast access
   - 10-second cache validity

2. **Fallback 1**: REST API `fetchMarketDepth`
   - Used if WebSocket stalls
   - Fetches top 1 level of order book

3. **Fallback 2**: `fetchTrades`
   - Gets last trade price
   - Used as last resort

4. **Cache**: Maintains last known price
   - Used if all APIs fail temporarily
   - Allows bot to continue operating

## Common Issues

### "Missing field 'cashQuantity' in payload"

**Solution**: Always provide `cashQuantity`. The bot calculates it automatically if using quantity-based orders.

### "No market data available"

**Solution**: 
- Verify the instrument exists on the exchange
- Check that you're using correct instrument name (e.g., `BTCUSD:DEMO` for demo)
- Wait for market data subscription to establish (shown in logs)
- Check internet connection

### "PRIVATE_KEY not found"

**Solution**: Ensure `.env` file exists and contains valid `PRIVATE_KEY` starting with `0x`.

### WebSocket Connection Issues

**Solution**:
- Bot will automatically retry via REST API fallback
- Check logs for specific error messages
- Verify network connectivity

## Troubleshooting

1. **Check logs** - Bot outputs detailed information about initialization and trading
2. **Verify configuration** - Double-check `.env` file parameters
3. **Test connectivity** - Ensure your machine can access Evedex APIs
4. **Monitor balance** - Keep track of available balance and fees
5. **Review positions** - Check for open positions in the exchange UI

## API Methods Used

From Evedex SDK:

- `container.account(name)` - Get wallet account
- `botWallet.createMarketOrderV2(payload)` - Place market orders
- `botWallet.updatePosition(payload)` - Set leverage
- `balance.listen()` - Subscribe to balance updates
- `gateway.listenOrderBookBest(instrument)` - Subscribe to price updates
- `gateway.onOrderBookBestUpdate(callback)` - Receive price updates

## Disclaimer

**This bot is provided for educational and testing purposes only.** 

- Use at your own risk
- The author is not responsible for financial losses
- Test thoroughly in demo environment before production use
- Understand the risks of automated trading
- Monitor bot operations regularly
- Comply with all local regulations

## License

MIT

## Support

For issues related to:
- **SDK**: Check [Evedex Documentation](https://docs.evedex.com/developers/exchange_bot_sdk)
- **Bot**: Review the code comments and logs
- **Trading**: Understand market risks and leverage implications

---

**Last Updated**: October 27, 2025

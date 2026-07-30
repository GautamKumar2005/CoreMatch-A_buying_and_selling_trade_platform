const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check endpoint (used by keep-alive ping + Render health checks) ──
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'CoreMatch Exchange',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + 's',
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    });
});


// Serve exported frontend static files (if present) from backend/public
// Next.js static export (output: 'export') places files in out/ → copied to public/
const fs = require('fs');
const staticPath = path.join(__dirname, 'public');
if (fs.existsSync(staticPath)) {
    // Serve static assets (JS, CSS, images, etc.)
    app.use(express.static(staticPath, { extensions: ['html'] }));

    // SPA fallback: for any non-API GET request, try serving
    // a matching .html file, then fall back to index.html
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
            return next();
        }
        // Try exact .html match first (e.g. /dashboard → dashboard.html)
        const htmlFile = path.join(staticPath, req.path + '.html');
        if (fs.existsSync(htmlFile)) {
            return res.sendFile(htmlFile);
        }
        // Fall back to index.html
        const indexFile = path.join(staticPath, 'index.html');
        if (fs.existsSync(indexFile)) {
            return res.sendFile(indexFile);
        }
        next();
    });
}


const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "CoreMatch_JWT_Secret_ChangeInProduction_2024";
const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY || "86400");
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "CoreMatch";

const SYMBOLS = ["AAPL","GOOGL","MSFT","AMZN","TSLA","NVDA","META","NFLX","RELIANCE","TCS","INFY","HDFC","BTC","ETH"];
const SEED_PRICES = {
    "AAPL": 17500, "GOOGL": 14000, "MSFT": 37500, "AMZN": 18500,
    "TSLA": 25000, "NVDA": 80000, "META": 50000, "NFLX": 60000,
    "RELIANCE": 280000, "TCS": 400000, "INFY": 175000, "HDFC": 160000,
    "BTC": 5000000, "ETH": 300000
};

// -----------------------------------------------------------------------------
// MongoDB Schemas & Models
// -----------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    _id: String,
    username: String,
    email: { type: String, unique: true },
    passwordHash: String,
    role: { type: String, default: "TRADER" },
    cash: Number,
    isActive: { type: Boolean, default: true },
    createdAt: Number
}, { versionKey: false });

const orderSchema = new mongoose.Schema({
    _id: String,
    symbol: String,
    userId: String,
    side: String,
    type: String,
    price: Number,
    quantity: Number,
    filledQty: { type: Number, default: 0 },
    remainingQty: Number,
    status: String,
    rejectionReason: String,
    timestamp: Number,
    createdAt: Number
}, { versionKey: false });

const tradeSchema = new mongoose.Schema({
    _id: String,
    symbol: String,
    buyOrderId: String,
    sellOrderId: String,
    buyerId: String,
    sellerId: String,
    price: Number,
    quantity: Number,
    timestamp: Number,
    createdAt: Number
}, { versionKey: false });

const portfolioSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    cash: Number,
    totalRealizedPnL: { type: Number, default: 0 },
    positions: [{
        symbol: String,
        quantity: Number,
        avgBuyPrice: Number,
        totalCost: Number,
        realizedPnL: Number,
        lastPrice: Number
    }],
    updatedAt: Number
}, { versionKey: false });

const auditLogSchema = new mongoose.Schema({
    event: String,
    userId: String,
    detail: String,
    timestamp: Number
}, { versionKey: false });

const marketSnapshotSchema = new mongoose.Schema({
    symbol: { type: String, unique: true },
    data: String,
    updatedAt: Number
}, { versionKey: false });


class MockModel {
    constructor(name) {
        this.name = name;
        this.filePath = path.join(__dirname, 'data', `${name}.json`);
        this.data = [];
        this.load();
    }
    
    load() {
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
        }
        if (fs.existsSync(this.filePath)) {
            try {
                this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            } catch (e) {
                this.data = [];
            }
        }
    }
    
    save() {
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
        }
        fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    }
    
    async find(query = {}) {
        let results = [...this.data];
        
        if (query) {
            results = results.filter(x => {
                return Object.keys(query).every(key => {
                    const val = query[key];
                    if (val && typeof val === 'object') {
                        if (val.$in) {
                            return val.$in.includes(x[key]);
                        }
                        if (val.$or) {
                            return true;
                        }
                    }
                    return x[key] === val;
                });
            });
            
            if (query.$or) {
                results = results.filter(x => {
                    return query.$or.some(q => {
                        return Object.keys(q).every(k => x[k] === q[k]);
                    });
                });
            }
        }
        
        const chain = {
            sort: (sortObj) => {
                const key = Object.keys(sortObj)[0];
                const order = sortObj[key];
                results.sort((a, b) => {
                    if (a[key] < b[key]) return -order;
                    if (a[key] > b[key]) return order;
                    return 0;
                });
                return chain;
            },
            limit: (num) => {
                results = results.slice(0, num);
                return chain;
            },
            then: (resolve) => resolve(results),
            catch: (reject) => {}
        };
        
        Object.assign(chain, Promise.resolve(results));
        return chain;
    }
    
    async findOne(query = {}) {
        const results = await this.find(query);
        return results[0] || null;
    }
    
    async findById(id) {
        const found = this.data.find(x => x._id === id);
        if (!found) return null;
        return this.wrapInstance(found);
    }
    
    wrapInstance(item) {
        if (!item) return null;
        if (item.save) return item;
        item.save = async () => {
            const idx = this.data.findIndex(x => x._id === item._id || (item.userId && x.userId === item.userId));
            if (idx !== -1) {
                this.data[idx] = item;
            } else {
                this.data.push(item);
            }
            this.save();
            return item;
        };
        item.markModified = () => {};
        return item;
    }
    
    async create(obj) {
        const item = { ...obj };
        const idx = this.data.findIndex(x => x._id === item._id || (item.userId && x.userId === item.userId));
        if (idx !== -1) {
            this.data[idx] = item;
        } else {
            this.data.push(item);
        }
        this.save();
        return this.wrapInstance(item);
    }
    
    async findByIdAndUpdate(id, update, options = {}) {
        let item = this.data.find(x => x._id === id);
        if (!item && options.upsert) {
            item = { _id: id };
            this.data.push(item);
        }
        if (item) {
            const setObj = update.$set || update;
            Object.assign(item, setObj);
            this.save();
        }
        return this.wrapInstance(item);
    }
    
    async findOneAndUpdate(query, update, options = {}) {
        let item = this.data.find(x => {
            return Object.keys(query).every(k => x[k] === query[k]);
        });
        if (!item && options.upsert) {
            item = { ...query };
            this.data.push(item);
        }
        if (item) {
            const setObj = update.$set || update;
            Object.assign(item, setObj);
            this.save();
        }
        return this.wrapInstance(item);
    }
    
    async createIndexes() {}
}

let User = mongoose.model('User', userSchema, 'users');
let Order = mongoose.model('Order', orderSchema, 'orders');
let Trade = mongoose.model('Trade', tradeSchema, 'trades');
let Portfolio = mongoose.model('Portfolio', portfolioSchema, 'portfolios');
let AuditLog = mongoose.model('AuditLog', auditLogSchema, 'auditLogs');
let MarketSnapshot = mongoose.model('MarketSnapshot', marketSnapshotSchema, 'marketSnapshots');

// -----------------------------------------------------------------------------
// Helper Cryptography & Auth Functions
// -----------------------------------------------------------------------------
function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, saltHex) {
    const saltBytes = Buffer.from(saltHex, 'hex');
    const hash = crypto.pbkdf2Sync(password, saltBytes, 10000, 32, 'sha256');
    return hash.toString('hex');
}

function verifyPassword(password, saltHex, storedHashHex) {
    const computed = hashPassword(password, saltHex);
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHashHex, 'hex'));
}

function issueToken(user) {
    return jwt.sign(
        {
            username: user.username,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        {
            issuer: "exchange",
            subject: user._id,
            expiresIn: JWT_EXPIRY
        }
    );
}

const revokedTokens = new Set();

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.substring(7);
    if (revokedTokens.has(token)) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { issuer: "exchange" });
        req.user = {
            userId: decoded.sub,
            username: decoded.username,
            role: decoded.role
        };
        next();
    } catch (e) {
        return res.status(401).json({ error: "Unauthorized" });
    }
}

function saveAuditLog(event, userId, detail) {
    AuditLog.create({
        event,
        userId,
        detail,
        timestamp: Date.now()
    }).catch(err => console.error("Audit log failed:", err));
}

// -----------------------------------------------------------------------------
// In-Memory Stats & Candles Engine
// -----------------------------------------------------------------------------
const timeframeMs = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000
};

const stats = {};
const candles = {};

function initSymbolStats(symbol, seedPrice = 10000) {
    if (!stats[symbol]) {
        stats[symbol] = {
            symbol,
            lastPrice: seedPrice,
            openPrice: seedPrice,
            highPrice: seedPrice,
            lowPrice: seedPrice,
            closePrice: seedPrice,
            volume: 0,
            turnover: 0,
            tradeCount: 0,
            prevClose: seedPrice
        };
    }
    if (!candles[symbol]) {
        candles[symbol] = {
            "1m": [], "5m": [], "15m": [], "1h": [], "1d": []
        };
    }
}

for (const sym of SYMBOLS) {
    initSymbolStats(sym, SEED_PRICES[sym]);
}

function processTradeStats(trade) {
    const { symbol, price, quantity, createdAt } = trade;
    initSymbolStats(symbol, price);
    
    const symStats = stats[symbol];
    symStats.lastPrice = price;
    if (symStats.openPrice === 0) symStats.openPrice = price;
    symStats.highPrice = Math.max(symStats.highPrice, price);
    if (symStats.lowPrice === 0 || symStats.lowPrice === 2147483647) {
        symStats.lowPrice = price;
    } else {
        symStats.lowPrice = Math.min(symStats.lowPrice, price);
    }
    symStats.closePrice = price;
    symStats.volume += quantity;
    symStats.turnover += price * quantity;
    symStats.tradeCount++;
    
    for (const tf of Object.keys(timeframeMs)) {
        const duration = timeframeMs[tf];
        const bucketTime = Math.floor(createdAt / duration) * duration;
        const tfCandles = candles[symbol][tf];
        
        let candle = tfCandles.find(c => c.timestamp === bucketTime);
        if (!candle) {
            candle = {
                timestamp: bucketTime,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: quantity,
                turnover: price * quantity,
                tradeCount: 1
            };
            tfCandles.push(candle);
            tfCandles.sort((a, b) => a.timestamp - b.timestamp);
            if (tfCandles.length > 500) {
                tfCandles.shift();
            }
        } else {
            candle.high = Math.max(candle.high, price);
            candle.low = Math.min(candle.low, price);
            candle.close = price;
            candle.volume += quantity;
            candle.turnover += price * quantity;
            candle.tradeCount++;
        }
    }
}

// -----------------------------------------------------------------------------
// WebSocket Broadcaster
// -----------------------------------------------------------------------------
const channels = new Map(); // channelName -> Set of WS connections

function subscribeClient(channel, ws) {
    if (!channels.has(channel)) {
        channels.set(channel, new Set());
    }
    channels.get(channel).add(ws);
    if (!ws.subscriptions) ws.subscriptions = new Set();
    ws.subscriptions.add(channel);
}

function unsubscribeClient(ws) {
    if (ws.subscriptions) {
        for (const channel of ws.subscriptions) {
            const set = channels.get(channel);
            if (set) {
                set.delete(ws);
                if (set.size === 0) channels.delete(channel);
            }
        }
    }
}

function broadcast(channel, data) {
    const set = channels.get(channel);
    if (set) {
        const payload = JSON.stringify(data);
        for (const ws of set) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(payload);
            }
        }
    }
}

function getTotalConnections() {
    let allWs = new Set();
    for (const set of channels.values()) {
        for (const ws of set) allWs.add(ws);
    }
    return allWs.size;
}

// -----------------------------------------------------------------------------
// Portfolio Engine
// -----------------------------------------------------------------------------
const loadedPortfolios = new Map(); // userId -> portfolio document object

async function loadAllPortfolios() {
    const ports = await Portfolio.find({});
    for (const p of ports) {
        loadedPortfolios.set(p.userId, p);
        // Sync position lastPrice values
        for (const pos of p.positions) {
            const symStats = stats[pos.symbol];
            if (symStats) pos.lastPrice = symStats.lastPrice;
        }
    }
    console.log(`Loaded ${loadedPortfolios.size} portfolios into memory.`);
}

function updateBuyerPortfolio(buyerId, symbol, price, qty, timestamp) {
    let p = loadedPortfolios.get(buyerId);
    if (!p) return;
    const cost = price * qty;
    p.cash -= cost;
    
    let pos = p.positions.find(x => x.symbol === symbol);
    if (!pos) {
        pos = { symbol, quantity: 0, avgBuyPrice: 0, totalCost: 0, realizedPnL: 0, lastPrice: price };
        p.positions.push(pos);
    }
    pos.totalCost += cost;
    pos.quantity += qty;
    if (pos.quantity > 0) {
        pos.avgBuyPrice = Math.floor(pos.totalCost / pos.quantity);
    }
    pos.lastPrice = price;
    p.updatedAt = timestamp;
    
    // Use updateOne to avoid ParallelSaveError
    Portfolio.updateOne(
        { userId: buyerId },
        { $set: { cash: p.cash, positions: p.positions, updatedAt: p.updatedAt } }
    ).catch(err => console.error("Error updating buyer portfolio DB:", err));
    
    // Also sync User.cash
    User.updateOne(
        { _id: buyerId },
        { $set: { cash: p.cash } }
    ).catch(err => console.error("Error updating buyer user cash DB:", err));
    
    broadcast(`portfolio/${buyerId}`, { type: "PORTFOLIO", data: formatPortfolioJson(p) });
}

function updateSellerPortfolio(sellerId, symbol, price, qty, timestamp) {
    let p = loadedPortfolios.get(sellerId);
    if (!p) return;
    const proceeds = price * qty;
    p.cash += proceeds;
    
    let pos = p.positions.find(x => x.symbol === symbol);
    if (pos) {
        const realizedPnL = (price - pos.avgBuyPrice) * qty;
        pos.realizedPnL += realizedPnL;
        p.totalRealizedPnL += realizedPnL;
        
        pos.quantity -= qty;
        pos.totalCost = pos.avgBuyPrice * pos.quantity;
        pos.lastPrice = price;
        
        if (pos.quantity <= 0) {
            p.positions = p.positions.filter(x => x.symbol !== symbol);
        }
    }
    p.updatedAt = timestamp;
    
    // Use updateOne to avoid ParallelSaveError
    Portfolio.updateOne(
        { userId: sellerId },
        { $set: { cash: p.cash, positions: p.positions, totalRealizedPnL: p.totalRealizedPnL, updatedAt: p.updatedAt } }
    ).catch(err => console.error("Error updating seller portfolio DB:", err));
    
    // Also sync User.cash
    User.updateOne(
        { _id: sellerId },
        { $set: { cash: p.cash } }
    ).catch(err => console.error("Error updating seller user cash DB:", err));
    
    broadcast(`portfolio/${sellerId}`, { type: "PORTFOLIO", data: formatPortfolioJson(p) });
}

function formatPortfolioJson(p) {
    const posList = p.positions.map(pos => {
        const unrealizedPnL = (pos.lastPrice - pos.avgBuyPrice) * pos.quantity;
        return {
            symbol: pos.symbol,
            quantity: pos.quantity,
            avgBuyPrice: pos.avgBuyPrice / 100,
            lastPrice: pos.lastPrice / 100,
            unrealizedPnL: unrealizedPnL / 100,
            realizedPnL: pos.realizedPnL / 100,
            value: (pos.lastPrice * pos.quantity) / 100
        };
    });
    
    let totalUnrealizedPnL = 0;
    let portfolioValue = p.cash;
    for (const pos of p.positions) {
        totalUnrealizedPnL += (pos.lastPrice - pos.avgBuyPrice) * pos.quantity;
        portfolioValue += pos.lastPrice * pos.quantity;
    }
    
    return {
        userId: p.userId,
        cash: p.cash / 100,
        positions: posList,
        totalRealizedPnL: p.totalRealizedPnL / 100,
        totalUnrealizedPnL: totalUnrealizedPnL / 100,
        portfolioValue: portfolioValue / 100
    };
}

// -----------------------------------------------------------------------------
// Subprocess Spawner & IPC Communication
// -----------------------------------------------------------------------------
let engineProcess = null;
let isRebuilding = false;
const pendingOrders = new Map();
const pendingCancels = new Map();
const pendingModifies = new Map();
const modifySymbols = new Map();
let latestMetrics = {
    totalOrders: 0,
    totalTrades: 0,
    rejectedOrders: 0,
    avgLatencyUs: 0,
    peakLatencyUs: 0
};
let benchmarkPromiseResolver = null;

function startEngineSubprocess() {
    const binaryPath = path.join(__dirname, 'matching_engine.exe');
    console.log(`Spawning C++ matching engine CLI at: ${binaryPath}`);
    engineProcess = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });

    let buffer = "";
    engineProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        let lines = buffer.split("\n");
        buffer = lines.pop(); // keep partial line in buffer
        
        for (const line of lines) {
            handleEngineOutput(line.trim());
        }
    });

    engineProcess.on('close', (code) => {
        console.warn(`Matching engine subprocess exited with code ${code}. Restarting...`);
        setTimeout(startEngineSubprocess, 1000);
    });
}

function handleEngineOutput(line) {
    if (!line) return;
    const tokens = line.split(" ");
    const cmd = tokens[0];
    
    if (cmd === "ORDER") {
        // ORDER <id> <symbol> <userId> <side> <type> <price> <qty> <filledQty> <remainingQty> <status> <rejectionReason>
        const [_, id, symbol, userId, side, type, priceStr, qtyStr, filledQtyStr, remainingQtyStr, status, reason] = tokens;
        const parsed = {
            id, symbol, userId, side, type,
            price: parseInt(priceStr),
            quantity: parseInt(qtyStr),
            filledQty: parseInt(filledQtyStr),
            remainingQty: parseInt(remainingQtyStr),
            status,
            rejectionReason: reason === "NONE" ? "" : reason.replace(/_/g, " "),
            timestamp: Date.now() * 1000,
            createdAt: Date.now()
        };
        
        // Update database (exclude benchmark user)
        if (userId !== "benchmark_user") {
            Order.findByIdAndUpdate(id, {
                filledQty: parsed.filledQty,
                remainingQty: parsed.remainingQty,
                status: parsed.status,
                rejectionReason: parsed.rejectionReason
            }, { upsert: true }).catch(e => console.error("Order save fail:", e));
            
            // Broadcast WS
            broadcast(`orders/${userId}`, { type: "ORDER", data: {
                id: parsed.id,
                symbol: parsed.symbol,
                userId: parsed.userId,
                side: parsed.side,
                type: parsed.type,
                price: parsed.price / 100,
                quantity: parsed.quantity,
                filledQty: parsed.filledQty,
                remainingQty: parsed.remainingQty,
                status: parsed.status,
                rejectionReason: parsed.rejectionReason,
                createdAt: parsed.createdAt
            }});
        }
        
        // Update pending submit promise
        const po = pendingOrders.get(id);
        if (po) {
            po.order = parsed;
        }
        
        if (!isRebuilding && engineProcess) {
            engineProcess.stdin.write(`ORDERBOOK ${parsed.symbol}\n`);
        }
        
    } else if (cmd === "TRADE") {
        // TRADE <id> <symbol> <buyOrderId> <sellOrderId> <buyerId> <sellerId> <price> <quantity> <timestamp>
        const [_, id, symbol, buyOrderId, sellOrderId, buyerId, sellerId, priceStr, qtyStr, tsStr] = tokens;
        const parsed = {
            id, symbol, buyOrderId, sellOrderId, buyerId, sellerId,
            price: parseInt(priceStr),
            quantity: parseInt(qtyStr),
            timestamp: parseInt(tsStr),
            createdAt: Math.floor(parseInt(tsStr) / 1000)
        };
        
        // Record in stats tracker
        processTradeStats(parsed);
        
        // Persist trade (exclude benchmark user)
        if (buyerId !== "benchmark_user" && sellerId !== "benchmark_user") {
            Trade.create({
                _id: parsed.id,
                symbol: parsed.symbol,
                buyOrderId: parsed.buyOrderId,
                sellOrderId: parsed.sellOrderId,
                buyerId: parsed.buyerId,
                sellerId: parsed.sellerId,
                price: parsed.price,
                quantity: parsed.quantity,
                timestamp: parsed.timestamp,
                createdAt: parsed.createdAt
            }).catch(e => console.error("Trade save fail:", e));
            
            // Process portfolios
            updateBuyerPortfolio(buyerId, symbol, parsed.price, parsed.quantity, parsed.createdAt);
            updateSellerPortfolio(sellerId, symbol, parsed.price, parsed.quantity, parsed.createdAt);
        }
        
        // Broadcast WS
        const wsTrade = {
            id: parsed.id,
            symbol: parsed.symbol,
            buyOrderId: parsed.buyOrderId,
            sellOrderId: parsed.sellOrderId,
            buyerId: parsed.buyerId,
            sellerId: parsed.sellerId,
            price: parsed.price / 100,
            quantity: parsed.quantity,
            value: (parsed.price * parsed.quantity) / 100,
            createdAt: parsed.createdAt
        };
        broadcast(`trades/${symbol}`, { type: "TRADE", data: wsTrade });
        broadcast("trades/ALL", { type: "TRADE", data: wsTrade });
        
        // Update stats ws
        const symStats = stats[symbol];
        if (symStats) {
            broadcast(`market/${symbol}`, { type: "STATS", data: formatStatsJson(symStats) });
        }
        
        // Update pending submit promise
        const poBuy = pendingOrders.get(buyOrderId);
        if (poBuy) poBuy.trades.push(wsTrade);
        const poSell = pendingOrders.get(sellOrderId);
        if (poSell) poSell.trades.push(wsTrade);
        
        if (!isRebuilding && engineProcess) {
            engineProcess.stdin.write(`ORDERBOOK ${parsed.symbol}\n`);
        }
        
    } else if (cmd === "ORDERBOOK") {
        // ORDERBOOK <symbol> <timestamp> BIDS:[price:qty:count,...] ASKS:[price:qty:count,...]
        const symbol = tokens[1];
        const ts = parseInt(tokens[2]);
        const bidsPart = tokens[3].substring(5, tokens[3].length - 1);
        const asksPart = tokens[4].substring(5, tokens[4].length - 1);
        
        const parseLevels = (part) => {
            if (!part) return [];
            return part.split(",").map(lvl => {
                const [price, qty, count] = lvl.split(":");
                const parsedPrice = parseInt(price);
                return {
                    price: isNaN(parsedPrice) ? null : parsedPrice / 100,
                    qty: parseInt(qty) || 0,
                    count: parseInt(count) || 0
                };
            }).filter(lvl => lvl.price !== null);
        };
        
        const bookJson = {
            symbol,
            bids: parseLevels(bidsPart),
            asks: parseLevels(asksPart),
            timestamp: ts
        };
        
        // Broadcast WS
        broadcast(`orderbook/${symbol}`, { type: "ORDERBOOK", data: bookJson });
        
        // Save to DB
        MarketSnapshot.findOneAndUpdate(
            { symbol },
            { data: JSON.stringify(bookJson), updatedAt: Date.now() },
            { upsert: true }
        ).catch(e => console.error("Snapshot save fail:", e));
        
    } else if (cmd === "METRICS") {
        // METRICS <totalOrders> <totalTrades> <rejectedOrders> <avgLatencyUs> <peakLatencyUs>
        latestMetrics = {
            totalOrders: parseInt(tokens[1]),
            totalTrades: parseInt(tokens[2]),
            rejectedOrders: parseInt(tokens[3]),
            avgLatencyUs: parseInt(tokens[4]),
            peakLatencyUs: parseInt(tokens[5])
        };
        if (benchmarkPromiseResolver) {
            benchmarkPromiseResolver();
            benchmarkPromiseResolver = null;
        }
        
    } else if (cmd === "SUCCESS") {
        const type = tokens[1]; // SUBMIT, CANCEL, MODIFY
        const orderId = tokens[2];
        
        if (type === "SUBMIT") {
            const po = pendingOrders.get(orderId);
            if (po) {
                pendingOrders.delete(orderId);
                po.resolve({
                    order: po.order ? {
                        id: po.order.id,
                        symbol: po.order.symbol,
                        userId: po.order.userId,
                        side: po.order.side,
                        type: po.order.type,
                        price: po.order.price / 100,
                        quantity: po.order.quantity,
                        filledQty: po.order.filledQty,
                        remainingQty: po.order.remainingQty,
                        status: po.order.status,
                        rejectionReason: po.order.rejectionReason,
                        createdAt: po.order.createdAt
                    } : {},
                    trades: po.trades,
                    tradeCount: po.trades.length
                });
            }
        } else if (type === "CANCEL") {
            const resolve = pendingCancels.get(orderId);
            if (resolve) {
                pendingCancels.delete(orderId);
                resolve(true);
            }
        } else if (type === "MODIFY") {
            const resolve = pendingModifies.get(orderId);
            if (resolve) {
                pendingModifies.delete(orderId);
                resolve(true);
            }
            const symbol = modifySymbols.get(orderId);
            if (symbol) {
                modifySymbols.delete(orderId);
                if (engineProcess) {
                    engineProcess.stdin.write(`ORDERBOOK ${symbol}\n`);
                }
            }
        }
        
    } else if (cmd === "ERROR") {
        const errorType = tokens[1];
        if (errorType === "CANCEL_FAILED" || errorType === "MODIFY_FAILED") {
            const orderId = tokens[2];
            const resolveC = pendingCancels.get(orderId);
            if (resolveC) {
                pendingCancels.delete(orderId);
                resolveC(false);
            }
            const resolveM = pendingModifies.get(orderId);
            if (resolveM) {
                pendingModifies.delete(orderId);
                resolveM(false);
            }
            modifySymbols.delete(orderId);
        }
    }
}

function formatStatsJson(s) {
    return {
        symbol: s.symbol,
        lastPrice: s.lastPrice / 100,
        openPrice: s.openPrice / 100,
        highPrice: s.highPrice / 100,
        lowPrice: s.lowPrice / 100,
        closePrice: s.closePrice / 100,
        volume: s.volume,
        vwap: s.volume > 0 ? (s.turnover / (s.volume * 100)) : 0,
        tradeCount: s.tradeCount,
        changePercent: s.prevClose > 0 ? (((s.lastPrice - s.prevClose) / s.prevClose) * 100) : 0
    };
}

// Rebuild books on restart
async function rebuildOrderBooksFromDb() {
    isRebuilding = true;
    const openOrders = await Order.find({ status: { $in: ["PENDING", "PARTIAL"] } });
    console.log(`Rebuilding matching engine books with ${openOrders.length} open orders...`);
    for (const o of openOrders) {
        engineProcess.stdin.write(`SUBMIT ${o.symbol} ${o._id} ${o.userId} ${o.side} ${o.type} ${o.price} ${o.quantity}\n`);
    }
    for (const sym of SYMBOLS) {
        engineProcess.stdin.write(`ORDERBOOK ${sym}\n`);
    }
    setTimeout(() => {
        isRebuilding = false;
        console.log("Order book rebuild complete. Live updates enabled.");
    }, 5000);
}

// -----------------------------------------------------------------------------
// Bot Market Simulator (JavaScript implementation)
// -----------------------------------------------------------------------------
let simulatorIntervals = [];
let simulatorRunning = false;

function startSimulator() {
    if (simulatorRunning) return;
    simulatorRunning = true;
    
    // Config: 3 orders per second per bot. midPrice moves randomly.
    SYMBOLS.forEach(sym => {
        let midPrice = stats[sym]?.lastPrice || SEED_PRICES[sym];
        const priceRange = Math.floor(midPrice / 100); // 1% range
        
        let counter = 0;
        const intervalId = setInterval(() => {
            const side = Math.random() < 0.5 ? "BUY" : "SELL";
            const type = Math.random() < 0.15 ? "MARKET" : "LIMIT";
            const qty = Math.floor(Math.random() * 100) + 1;
            
            let price = 0;
            if (type === "LIMIT") {
                const offset = Math.floor(Math.random() * priceRange);
                if (side === "BUY") {
                    price = midPrice - offset;
                } else {
                    price = midPrice + offset;
                }
                if (price <= 0) price = 1;
            }
            
            const botId = `BOT_${sym}`;
            const orderId = `SIM-${Date.now() * 1000}-${counter++}`;
            
            // Submit directly to engine, bypassing database saving
            engineProcess.stdin.write(`SUBMIT ${sym} ${orderId} ${botId} ${side} ${type} ${price} ${qty}\n`);
        }, 333); // 3 orders per second
        
        simulatorIntervals.push(intervalId);
    });
    
    console.log("Market simulator started with 14 bots.");
}

function stopSimulator() {
    simulatorIntervals.forEach(id => clearInterval(id));
    simulatorIntervals = [];
    simulatorRunning = false;
    console.log("Market simulator stopped.");
}

// -----------------------------------------------------------------------------
// Express HTTP Routing (REST API)
// -----------------------------------------------------------------------------

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password || password.length < 6) {
            return res.status(400).json({ error: "username, email, and password (min 6 chars) required" });
        }
        
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "Email already registered" });
        }
        
        const userId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const salt = generateSalt();
        const hash = hashPassword(password, salt);
        
        const startingCash = 10000000; // $100k (10,000,000 cents)
        const user = await User.create({
            _id: userId,
            username,
            email,
            passwordHash: `${hash}:${salt}`,
            role: "TRADER",
            cash: startingCash,
            createdAt: Date.now()
        });
        
        const portfolio = await Portfolio.create({
            userId,
            cash: startingCash,
            positions: [],
            updatedAt: Date.now()
        });
        
        loadedPortfolios.set(userId, portfolio);
        saveAuditLog("USER_REGISTER", userId, email);
        
        const token = issueToken(user);
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                cash: user.cash / 100
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "email and password required" });
        }
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const [storedHash, salt] = user.passwordHash.split(':');
        if (!verifyPassword(password, salt, storedHash)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const token = issueToken(user);
        saveAuditLog("USER_LOGIN", user._id, email);
        
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                cash: user.cash / 100
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PROFILE
app.get('/api/auth/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            cash: user.cash / 100
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// LOGOUT
app.post('/api/auth/logout', authenticate, (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        revokedTokens.add(authHeader.substring(7));
    }
    res.json({ message: "Logged out" });
});

// POST ORDER
app.post('/api/orders', authenticate, async (req, res) => {
    try {
        const { symbol, side, type, price, quantity } = req.body;
        if (!symbol || !side || !quantity || quantity <= 0) {
            return res.status(400).json({ error: "symbol, side, and quantity required" });
        }
        
        if (!SYMBOLS.includes(symbol)) {
            return res.status(422).json({ error: `Invalid or unsupported symbol: ${symbol}` });
        }
        
        const priceCents = type === "MARKET" ? 0 : Math.floor(parseFloat(price) * 100);
        if (type === "LIMIT" && priceCents <= 0) {
            return res.status(422).json({ error: "Limit price must be positive" });
        }
        
        const user = await User.findById(req.user.userId);
        if (!user || !user.isActive) {
            return res.status(422).json({ error: "User account is inactive" });
        }
        
        const portfolio = loadedPortfolios.get(req.user.userId);
        if (!portfolio) {
            return res.status(500).json({ error: "User portfolio not loaded" });
        }
        
        // Pre-trade risk check
        if (side === "BUY") {
            if (type === "LIMIT") {
                const required = priceCents * quantity;
                if (portfolio.cash < required) {
                    return res.status(422).json({
                        error: `Insufficient cash. Required: $${(required / 100).toFixed(2)}, Available: $${(portfolio.cash / 100).toFixed(2)}`
                    });
                }
            }
        } else {
            const pos = portfolio.positions.find(x => x.symbol === symbol);
            if (!pos || pos.quantity < quantity) {
                return res.status(422).json({ error: `Insufficient holdings for ${symbol}` });
            }
        }
        
        const orderId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const order = {
            id: orderId,
            symbol,
            userId: req.user.userId,
            side,
            type,
            price: priceCents,
            quantity
        };
        
        // Save PENDING order to database
        await Order.create({
            _id: orderId,
            symbol,
            userId: req.user.userId,
            side,
            type,
            price: priceCents,
            quantity,
            filledQty: 0,
            remainingQty: quantity,
            status: "PENDING",
            timestamp: Date.now() * 1000,
            createdAt: Date.now()
        });
        
        // Submit order to matching engine subprocess and await execution result
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingOrders.delete(orderId);
                reject(new Error("Timeout waiting for order response from engine"));
            }, 5000);
            
            pendingOrders.set(orderId, {
                resolve: (resVal) => {
                    clearTimeout(timeout);
                    resolve(resVal);
                },
                trades: [],
                order: null
            });
            
            engineProcess.stdin.write(`SUBMIT ${symbol} ${orderId} ${req.user.userId} ${side} ${type} ${priceCents} ${quantity}\n`);
        });
        
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET ORDERS (LIST)
app.get('/api/orders', authenticate, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.userId })
            .sort({ createdAt: -1 })
            .limit(100);
            
        const formatted = orders.map(o => ({
            id: o._id,
            symbol: o.symbol,
            userId: o.userId,
            side: o.side,
            type: o.type,
            price: o.price / 100,
            quantity: o.quantity,
            filledQty: o.filledQty,
            remainingQty: o.remainingQty,
            status: o.status,
            rejectionReason: o.rejectionReason,
            createdAt: o.createdAt
        }));
        
        res.json({ orders: formatted, count: formatted.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// CANCEL ORDER
app.delete('/api/orders/:id', authenticate, async (req, res) => {
    try {
        const orderId = req.params.id;
        const cancelled = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                pendingCancels.delete(orderId);
                resolve(false);
            }, 3000);
            pendingCancels.set(orderId, (val) => {
                clearTimeout(timeout);
                resolve(val);
            });
            engineProcess.stdin.write(`CANCEL ${orderId} ${req.user.userId}\n`);
        });
        
        if (!cancelled) {
            return res.status(404).json({ error: "Order not found or not yours" });
        }
        res.json({ message: "Order cancelled", orderId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// MODIFY ORDER
app.put('/api/orders/:id', authenticate, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { price, quantity } = req.body;
        if (!price || !quantity || price <= 0 || quantity <= 0) {
            return res.status(400).json({ error: "price and quantity required" });
        }
        
        const orderObj = await Order.findById(orderId);
        if (!orderObj) {
            return res.status(404).json({ error: "Order not found" });
        }
        const symbol = orderObj.symbol;
        const priceCents = Math.floor(parseFloat(price) * 100);
        
        const modified = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                pendingModifies.delete(orderId);
                modifySymbols.delete(orderId);
                resolve(false);
            }, 3000);
            pendingModifies.set(orderId, (val) => {
                clearTimeout(timeout);
                resolve(val);
            });
            modifySymbols.set(orderId, symbol);
            engineProcess.stdin.write(`MODIFY ${orderId} ${req.user.userId} ${priceCents} ${quantity}\n`);
        });
        
        if (!modified) {
            return res.status(404).json({ error: "Order not found" });
        }
        res.json({ message: "Order modified", orderId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// SYMBOLS WATCHLIST
app.get('/api/market/symbols', (req, res) => {
    res.json({ symbols: SYMBOLS });
});

// ORDERBOOK SNAPSHOT
app.get('/api/market/orderbook/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        if (!SYMBOLS.includes(symbol)) return res.status(404).json({ error: "Symbol not found" });
        const snapDoc = await MarketSnapshot.findOne({ symbol });
        if (snapDoc) {
            res.send(snapDoc.data);
        } else {
            res.json({ symbol, bids: [], asks: [], timestamp: Date.now() });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// RECENT TRADES
app.get('/api/market/trades/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const limit = Math.min(200, parseInt(req.query.limit || "50"));
        const tradesList = await Trade.find({ symbol })
            .sort({ createdAt: -1 })
            .limit(limit);
            
        const formatted = tradesList.map(t => ({
            id: t._id,
            symbol: t.symbol,
            buyOrderId: t.buyOrderId,
            sellOrderId: t.sellOrderId,
            buyerId: t.buyerId,
            sellerId: t.sellerId,
            price: t.price / 100,
            quantity: t.quantity,
            value: (t.price * t.quantity) / 100,
            createdAt: t.createdAt
        }));
        
        res.json({ symbol, trades: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// STATS FOR SYMBOL
app.get('/api/market/stats/:symbol', (req, res) => {
    const symbol = req.params.symbol;
    const symStats = stats[symbol];
    if (!symStats) return res.status(404).json({ error: "Symbol not found" });
    res.json(formatStatsJson(symStats));
});

// STATS FOR ALL SYMBOLS
app.get('/api/market/stats', (req, res) => {
    const arr = SYMBOLS.map(sym => formatStatsJson(stats[sym]));
    res.json({ symbols: arr });
});

// CANDLESTICKS (OHLCV)
app.get('/api/market/candles/:symbol', (req, res) => {
    try {
        const symbol = req.params.symbol;
        const tf = req.query.tf || "1m";
        const limit = Math.min(500, parseInt(req.query.limit || "200"));
        
        if (!candles[symbol] || !candles[symbol][tf]) {
            return res.json({ symbol, timeframe: tf, candles: [] });
        }
        
        const list = candles[symbol][tf].slice(-limit).map(c => ({
            time: Math.floor(c.timestamp / 1000), // TradingView requires seconds
            open: c.open / 100,
            high: c.high / 100,
            low: c.low / 100,
            close: c.close / 100,
            volume: c.volume,
            vwap: c.volume > 0 ? (c.turnover / (c.volume * 100)) : 0
        }));
        
        res.json({ symbol, timeframe: tf, candles: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// USER PORTFOLIO
app.get('/api/portfolio', authenticate, (req, res) => {
    const port = loadedPortfolios.get(req.user.userId);
    if (!port) return res.status(404).json({ error: "Portfolio not found" });
    res.json(formatPortfolioJson(port));
});

// PORTFOLIO TRADE HISTORY
app.get('/api/portfolio/history', authenticate, async (req, res) => {
    try {
        const uid = req.user.userId;
        const list = await Trade.find({ $or: [{ buyerId: uid }, { sellerId: uid }] })
            .sort({ createdAt: -1 })
            .limit(100);
            
        const formatted = list.map(t => ({
            id: t._id,
            symbol: t.symbol,
            buyOrderId: t.buyOrderId,
            sellOrderId: t.sellOrderId,
            buyerId: t.buyerId,
            sellerId: t.sellerId,
            price: t.price / 100,
            quantity: t.quantity,
            value: (t.price * t.quantity) / 100,
            createdAt: t.createdAt
        }));
        
        res.json({ trades: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PORTFOLIO DEPOSIT (CREDIT)
app.post('/api/portfolio/deposit', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;
        const amountVal = parseFloat(amount);
        if (isNaN(amountVal) || amountVal <= 0) {
            return res.status(400).json({ error: "Invalid deposit amount" });
        }
        const cents = Math.round(amountVal * 100);
        const p = loadedPortfolios.get(req.user.userId);
        if (!p) return res.status(404).json({ error: "Portfolio not found" });
        
        p.cash += cents;
        p.updatedAt = Date.now();
        
        await Portfolio.updateOne({ userId: req.user.userId }, { $set: { cash: p.cash, updatedAt: p.updatedAt } });
        await User.updateOne({ _id: req.user.userId }, { $set: { cash: p.cash } });
        
        saveAuditLog("DEPOSIT", req.user.userId, `Deposited $${amountVal.toFixed(2)}`);
        broadcast(`portfolio/${req.user.userId}`, { type: "PORTFOLIO", data: formatPortfolioJson(p) });
        
        res.json({ message: "Deposit successful", cash: p.cash / 100 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PORTFOLIO WITHDRAWAL (DEBIT)
app.post('/api/portfolio/withdraw', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;
        const amountVal = parseFloat(amount);
        if (isNaN(amountVal) || amountVal <= 0) {
            return res.status(400).json({ error: "Invalid withdrawal amount" });
        }
        const cents = Math.round(amountVal * 100);
        const p = loadedPortfolios.get(req.user.userId);
        if (!p) return res.status(404).json({ error: "Portfolio not found" });
        
        if (p.cash < cents) {
            return res.status(422).json({ error: "Insufficient cash balance" });
        }
        
        p.cash -= cents;
        p.updatedAt = Date.now();
        
        await Portfolio.updateOne({ userId: req.user.userId }, { $set: { cash: p.cash, updatedAt: p.updatedAt } });
        await User.updateOne({ _id: req.user.userId }, { $set: { cash: p.cash } });
        
        saveAuditLog("WITHDRAWAL", req.user.userId, `Withdrew $${amountVal.toFixed(2)}`);
        broadcast(`portfolio/${req.user.userId}`, { type: "PORTFOLIO", data: formatPortfolioJson(p) });
        
        res.json({ message: "Withdrawal successful", cash: p.cash / 100 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PORTFOLIO AUDIT LOGS
app.get('/api/portfolio/audit-logs', authenticate, async (req, res) => {
    try {
        const logs = await AuditLog.find({ userId: req.user.userId })
            .sort({ timestamp: -1 })
            .limit(50);
        res.json({ logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE ACCOUNT
app.delete('/api/auth/delete-account', authenticate, async (req, res) => {
    try {
        const uid = req.user.userId;
        
        // Clear from memory
        loadedPortfolios.delete(uid);
        
        // Delete from DB
        await User.deleteOne({ _id: uid });
        await Portfolio.deleteOne({ userId: uid });
        await Order.deleteMany({ userId: uid });
        await Trade.deleteMany({ $or: [{ buyerId: uid }, { sellerId: uid }] });
        
        // Save audit log
        saveAuditLog("ACCOUNT_DELETED", uid, `Account deleted`);
        
        res.json({ message: "Account deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ADMIN METRICS
app.get('/api/admin/metrics', authenticate, (req, res) => {
    res.json({
        ...latestMetrics,
        connectedUsers: getTotalConnections(),
        simulatorRunning,
        symbols: SYMBOLS.length
    });
});

// ADMIN SIMULATOR START
app.post('/api/admin/simulator/start', authenticate, (req, res) => {
    if (req.user.role !== "ADMIN") return res.status(401).json({ error: "Admin role required" });
    startSimulator();
    res.json({ message: "Simulator started" });
});

// ADMIN SIMULATOR STOP
app.post('/api/admin/simulator/stop', authenticate, (req, res) => {
    if (req.user.role !== "ADMIN") return res.status(401).json({ error: "Admin role required" });
    stopSimulator();
    res.json({ message: "Simulator stopped" });
});

// STRESS BENCHMARK
app.post('/api/admin/benchmark', async (req, res) => {
    try {
        const count = Math.min(1000000, parseInt(req.body.count || "100000"));
        console.log(`Running benchmark with ${count} orders...`);
        
        const start = Date.now();
        
        // Send METRICS command after all dump
        const completedPromise = new Promise((resolve) => {
            benchmarkPromiseResolver = resolve;
        });
        
        // Write orders to stdout in a tight synchronous block
        const botId = "benchmark_user";
        for (let i = 0; i < count; i++) {
            const side = Math.random() < 0.5 ? "BUY" : "SELL";
            const price = 9000 + Math.floor(Math.random() * 2000); // 9000 to 11000 cents
            const qty = Math.floor(Math.random() * 100) + 1;
            const orderId = `BM-${start}-${i}`;
            
            engineProcess.stdin.write(`SUBMIT AAPL ${orderId} ${botId} ${side} LIMIT ${price} ${qty}\n`);
        }
        
        // Send metrics request to trigger resolution
        engineProcess.stdin.write("METRICS\n");
        
        await completedPromise;
        
        const elapsedMs = Date.now() - start;
        const ops = Math.floor((count / elapsedMs) * 1000);
        
        res.json({
            ordersSubmitted: count,
            tradesExecuted: latestMetrics.totalTrades,
            elapsedMs,
            ordersPerSec: ops,
            tradesPerSec: Math.floor((latestMetrics.totalTrades / elapsedMs) * 1000),
            avgLatencyUs: latestMetrics.avgLatencyUs,
            peakLatencyUs: latestMetrics.peakLatencyUs
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({ status: "ok", engine: "CoreMatch Node-Subprocess v1.0" });
});

// -----------------------------------------------------------------------------
// Startup Server Initialization
// -----------------------------------------------------------------------------
async function initServer() {
    console.log("Connecting to MongoDB...");
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 3000 });
        console.log(`MongoDB connected to: ${DB_NAME}`);
        
        // Create collections if empty/ensure indexes
        await User.createIndexes();
        await Order.createIndexes();
        await Trade.createIndexes();
    } catch (err) {
        console.warn("[FALLBACK] MongoDB Atlas connection failed:", err.message);
        console.warn("[FALLBACK] Switching to offline local JSON database mode...");
        
        User = new MockModel('User');
        Order = new MockModel('Order');
        Trade = new MockModel('Trade');
        Portfolio = new MockModel('Portfolio');
        AuditLog = new MockModel('AuditLog');
        MarketSnapshot = new MockModel('MarketSnapshot');
    }
    
    // Load historical trade data to build charts
    console.log("Loading historical trade data to rebuild charts...");
    const trades = await Trade.find({}).sort({ timestamp: 1 });
    console.log(`Loaded ${trades.length} historical trades.`);
    for (const t of trades) {
        processTradeStats(t);
    }
    
    // Load Portfolios into Memory
    await loadAllPortfolios();
    
    // Start C++ process
    startEngineSubprocess();
    
    // Delay slightly to ensure subprocess is running, then load open books
    setTimeout(async () => {
        await rebuildOrderBooksFromDb();
        if (process.env.START_SIMULATOR === "true") {
            startSimulator();
        }
    }, 1000);
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const body = JSON.parse(message);
            const { action, channel } = body;
            if (action === "subscribe" && channel) {
                subscribeClient(channel, ws);
                ws.send(JSON.stringify({ type: "SUBSCRIBED", channel }));
            }
        } catch (e) {}
    });
    
    ws.on('close', () => {
        unsubscribeClient(ws);
    });
});

// Periodically broadcast metrics to admin panel
setInterval(() => {
    broadcast("admin/metrics", {
        type: "METRICS",
        totalOrders: latestMetrics.totalOrders,
        totalTrades: latestMetrics.totalTrades,
        avgLatencyUs: latestMetrics.avgLatencyUs,
        peakLatencyUs: latestMetrics.peakLatencyUs,
        connections: getTotalConnections()
    });
}, 2000);

initServer().then(() => {
    server.listen(PORT, () => {
        console.log(`[CoreMatch] Node Server running on port ${PORT}`);
        console.log(`[CoreMatch] Environment: ${process.env.NODE_ENV || 'development'}`);

        // ─────────────────────────────────────────────────────────────
        // KEEP-ALIVE: Ping the /health endpoint every 3 hours so that
        // Render's free tier doesn't spin down the service.
        // Render spins down after 15 min of inactivity — this prevents it.
        // ─────────────────────────────────────────────────────────────
        const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const PING_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours in ms

        const keepAlive = () => {
            const pingUrl = `${RENDER_URL}/health`;
            const protocol = pingUrl.startsWith('https') ? require('https') : require('http');

            const req = protocol.get(pingUrl, (res) => {
                const now = new Date().toISOString();
                console.log(`[KeepAlive] Pinged ${pingUrl} → ${res.statusCode} at ${now}`);
            });

            req.on('error', (err) => {
                console.warn(`[KeepAlive] Ping failed: ${err.message}`);
            });

            req.setTimeout(10000, () => {
                req.destroy();
                console.warn('[KeepAlive] Ping timed out after 10s');
            });
        };

        // First ping after 5 minutes (let the server fully warm up)
        setTimeout(keepAlive, 5 * 60 * 1000);

        // Then ping every 3 hours
        setInterval(keepAlive, PING_INTERVAL_MS);

        console.log(`[KeepAlive] Scheduled self-ping every 3 hours → ${RENDER_URL}/health`);
    });
}).catch(err => {
    console.error("Server initialization failed:", err);
    process.exit(1);
});

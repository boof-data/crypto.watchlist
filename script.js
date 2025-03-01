let customWatchlist = [];
let trendingCrypto = [];
let trendingETH = [];
let trendingSOL = [];
let coinList = [];
let coinCache = new Map();
let requestQueue = Promise.resolve();
let lastUpdate = 0;
let activeTrendingTab = 'crypto';
const stableCoinIds = ['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd'];
const HELIUS_API_KEY = 'c5bf60fd-ad6d-4c08-ae51-ad352574cfaf';
const COINGECKO_PROXY = 'https://corsproxy.io/?';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function queueFetch(url, retries = 3) {
    return new Promise((resolve) => {
        requestQueue = requestQueue.then(async () => {
            await new Promise(res => setTimeout(res, 250)); // 250ms delay (~4 reqs/sec)
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(`${COINGECKO_PROXY}${encodeURIComponent(url)}`);
                    if (!response.ok) {
                        if (response.status === 429) {
                            console.warn(`Rate limit hit for ${url}, retrying (${i+1}/${retries})...`);
                            await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
                            continue;
                        }
                        throw new Error(`HTTP error: ${response.status}`);
                    }
                    const data = await response.json();
                    resolve(data);
                    return;
                } catch (error) {
                    console.error(`Failed to fetch ${url} (attempt ${i+1}/${retries}):`, error);
                    if (i === retries - 1) resolve(null);
                }
            }
        });
    });
}

function getCachedData(key) {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
    return null;
}

function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
}

async function fetchCoinList() {
    try {
        const cached = getCachedData('coinList');
        if (cached) {
            coinList = cached;
            console.log('Loaded coin list from cache');
            return;
        }
        const data = await queueFetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
        if (data) {
            coinList = data;
            setCachedData('coinList', data);
            console.log('Full coin list fetched:', coinList.slice(0, 5));
        }
    } catch (error) {
        console.error('Failed to fetch coin list:', error);
    }
}

async function fetchCryptoData(coinId) {
    if (coinCache.has(coinId)) {
        const cached = coinCache.get(coinId);
        const now = Date.now();
        if (now - (cached.lastFetched || 0) < CACHE_TTL) return cached;
    }
    const data = await queueFetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`);
    if (data) {
        const coinData = {
            id: data.id,
            name: data.name,
            symbol: data.symbol.toUpperCase(),
            price: data.market_data.current_price.usd,
            change24h: data.market_data.price_change_percentage_24h,
            marketCap: data.market_data.market_cap.usd,
            sparkline: data.market_data.sparkline_7d ? data.market_data.sparkline_7d.price.slice(-24) : [],
            image: data.image.thumb,
            lastFetched: Date.now()
        };
        coinCache.set(coinId, coinData);
        setCachedData(`coin_${coinId}`, coinData); // Cache individual coins
        return coinData;
    }
    const cached = getCachedData(`coin_${coinId}`);
    return cached || null;
}

async function fetchTrendingWatchlists() {
    try {
        const cached = getCachedData('trendingWatchlists');
        if (cached) {
            trendingCrypto = cached.crypto;
            trendingETH = cached.eth;
            trendingSOL = cached.sol;
            console.log('Loaded trending watchlists from cache');
            updateTrendingWatchlist();
            return;
        }
        const data = await queueFetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true');
        if (data) {
            const nonStableCoins = data.filter(coin => !stableCoinIds.includes(coin.id));
            trendingCrypto = nonStableCoins.slice(0, 10).map(coin => ({
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol.toUpperCase(),
                price: coin.current_price,
                change24h: coin.price_change_percentage_24h,
                marketCap: coin.market_cap,
                sparkline: coin.sparkline_in_7d ? coin.sparkline_in_7d.price.slice(-24) : [],
                image: coin.image
            }));
            trendingETH = nonStableCoins
                .filter(coin => coinList.some(c => c.id === coin.id && c.platforms && c.platforms.ethereum))
                .slice(0, 10)
                .map(coin => ({
                    id: coin.id,
                    name: coin.name,
                    symbol: coin.symbol.toUpperCase(),
                    price: coin.current_price,
                    change24h: coin.price_change_percentage_24h,
                    marketCap: coin.market_cap,
                    sparkline: coin.sparkline_in_7d ? coin.sparkline_in_7d.price.slice(-24) : [],
                    image: coin.image
                }));
            trendingSOL = nonStableCoins
                .filter(coin => coinList.some(c => c.id === coin.id && c.platforms && c.platforms.solana))
                .slice(0, 10)
                .map(coin => ({
                    id: coin.id,
                    name: coin.name,
                    symbol: coin.symbol.toUpperCase(),
                    price: coin.current_price,
                    change24h: coin.price_change_percentage_24h,
                    marketCap: coin.market_cap,
                    sparkline: coin.sparkline_in_7d ? coin.sparkline_in_7d.price.slice(-24) : [],
                    image: coin.image
                }));
            trendingCrypto.forEach(coin => coinCache.set(coin.id, { ...coin, lastFetched: Date.now() }));
            trendingETH.forEach(coin => coinCache.set(coin.id, { ...coin, lastFetched: Date.now() }));
            trendingSOL.forEach(coin => coinCache.set(coin.id, { ...coin, lastFetched: Date.now() }));
            setCachedData('trendingWatchlists', { crypto: trendingCrypto, eth: trendingETH, sol: trendingSOL });
            updateTrendingWatchlist();
        }
    } catch (error) {
        console.error('Failed to fetch trending watchlists:', error);
    }
}

async function fetchFearAndGreed() {
    try {
        const cached = getCachedData('fearAndGreed');
        if (cached) {
            const value = parseInt(cached.data[0].value);
            const dial = document.getElementById('fear-greed-dial');
            const valueText = document.getElementById('fear-greed-value');
            const circumference = 2 * Math.PI * 40;
            const offset = circumference - (value / 100) * circumference;
            dial.style.strokeDasharray = `${circumference} ${circumference}`;
            dial.style.strokeDashoffset = offset;
            valueText.textContent = value;
            return;
        }
        const response = await fetch('https://api.alternative.me/fng/');
        const data = await response.json();
        setCachedData('fearAndGreed', data);
        const value = parseInt(data.data[0].value);
        const dial = document.getElementById('fear-greed-dial');
        const valueText = document.getElementById('fear-greed-value');
        const circumference = 2 * Math.PI * 40;
        const offset = circumference - (value / 100) * circumference;
        dial.style.strokeDasharray = `${circumference} ${circumference}`;
        dial.style.strokeDashoffset = offset;
        valueText.textContent = value;
    } catch (error) {
        console.error('Failed to fetch Fear & Greed index:', error);
        document.getElementById('fear-greed-value').textContent = 'N/A';
    }
}

async function fetchHeaderPrices() {
    try {
        const cached = getCachedData('headerPrices');
        if (cached) {
            document.getElementById('btc-price').innerHTML = `<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" alt="BTC" class="token-logo"> $${cached.bitcoin.usd.toLocaleString()}`;
            document.getElementById('eth-price').innerHTML = `<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" class="token-logo"> $${cached.ethereum.usd.toLocaleString()}`;
            document.getElementById('sol-price').innerHTML = `<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" class="token-logo"> $${cached.solana.usd.toLocaleString()}`;
            return;
        }
        const data = await queueFetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd');
        if (data && data.bitcoin && data.ethereum && data.solana) {
            document.getElementById('btc-price').innerHTML = `<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" alt="BTC" class="token-logo"> $${data.bitcoin.usd.toLocaleString()}`;
            document.getElementById('eth-price').innerHTML = `<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" class="token-logo"> $${data.ethereum.usd.toLocaleString()}`;
            document.getElementById('sol-price').innerHTML = `<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" class="token-logo"> $${data.solana.usd.toLocaleString()}`;
            setCachedData('headerPrices', data);
        } else {
            console.warn('Header prices fetch returned incomplete data, using defaults');
            document.getElementById('btc-price').innerHTML = `<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" alt="BTC" class="token-logo"> $--`;
            document.getElementById('eth-price').innerHTML = `<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" class="token-logo"> $--`;
            document.getElementById('sol-price').innerHTML = `<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" class="token-logo"> $--`;
        }
    } catch (error) {
        console.error('Failed to fetch header prices:', error);
        document.getElementById('btc-price').innerHTML = `<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" alt="BTC" class="token-logo"> $--`;
        document.getElementById('eth-price').innerHTML = `<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" class="token-logo"> $--`;
        document.getElementById('sol-price').innerHTML = `<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" class="token-logo"> $--`;
    }
}

async function fetchSolanaBalances(address) {
    try {
        const solBalResponse = await fetch(`https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] })
        });
        const solBal = await solBalResponse.json();
        if (!solBal.result) throw new Error('No balance data returned from Solana');
        const solValue = solBal.result.value / 1e9; // Lamports to SOL
        const cachedSolPrice = getCachedData('solPrice');
        let solPriceData = cachedSolPrice;
        if (!solPriceData) {
            solPriceData = await queueFetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (solPriceData) setCachedData('solPrice', solPriceData);
        }
        let totalValue = solValue * (solPriceData?.solana?.usd || 0);

        const tokenBalResponse = await fetch(`https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [address, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }] })
        });
        const tokenBal = await tokenBalResponse.json();
        const tokens = tokenBal.result.value || [];
        for (const token of tokens) {
            const mint = token.account.data.parsed.info.mint;
            const amount = token.account.data.parsed.info.tokenAmount.uiAmount;
            const coin = coinList.find(c => c.platforms && c.platforms.solana === mint);
            if (coin) {
                const priceData = await fetchCryptoData(coin.id);
                totalValue += amount * (priceData?.price || 0);
            } else {
                console.log(`No CoinGecko match for Solana mint: ${mint}`);
            }
        }
        return totalValue;
    } catch (error) {
        console.error(`Failed to fetch Solana wallet ${address}:`, error);
        return 0;
    }
}

async function fetchXRPBalances(address) {
    return new Promise((resolve) => {
        const ws = new WebSocket('wss://xrplcluster.com');
        ws.onopen = () => {
            ws.send(JSON.stringify({
                id: 1,
                command: "account_info",
                account: address,
                ledger_index: "validated"
            }));
        };
        let totalValue = 0;

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.id === 1 && data.result && data.result.account_data) {
                const xrpValue = parseFloat(data.result.account_data.Balance) / 1e6; // Drops to XRP
                const cachedXrpPrice = getCachedData('xrpPrice');
                let xrpPriceData = cachedXrpPrice;
                if (!xrpPriceData) {
                    xrpPriceData = await queueFetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd');
                    if (xrpPriceData) setCachedData('xrpPrice', xrpPriceData);
                }
                totalValue += xrpValue * (xrpPriceData?.ripple?.usd || 0);
                ws.close();
                resolve(totalValue);
            }
        };

        ws.onerror = (error) => {
            console.error(`WebSocket error for XRP wallet ${address}:`, error);
            ws.close();
            resolve(0);
        };
    });
}

async function updatePortfolio() {
    const solWallet = document.getElementById('solWallet').value.trim();
    const xrpWallet = document.getElementById('xrpWallet').value.trim();
    let totalValue = 0;

    if (solWallet) {
        localStorage.setItem('solWallet', solWallet);
        totalValue += await fetchSolanaBalances(solWallet);
    }
    if (xrpWallet) {
        localStorage.setItem('xrpWallet', xrpWallet);
        totalValue += await fetchXRPBalances(xrpWallet);
    }
    document.getElementById('portfolio-value').textContent = `$${totalValue.toFixed(2)}`;
}

function loadSavedWallets() {
    const solWallet = localStorage.getItem('solWallet') || '';
    const xrpWallet = localStorage.getItem('xrpWallet') || '';
    document.getElementById('solWallet').value = solWallet;
    document.getElementById('xrpWallet').value = xrpWallet;
}

async function initPage() {
    await fetchCoinList();
    await fetchTrendingWatchlists();
    await fetchHeaderPrices();
    await loadCustomWatchlist();
    await fetchFearAndGreed();
    loadSavedWallets();
    setTimeout(updatePortfolio, 2000); // Defer portfolio update further
}

function formatMarketCap(marketCap) {
    if (!marketCap) return 'N/A';
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${marketCap.toLocaleString()}`;
}

function formatPrice(price) {
    if (!price || price >= 1) return `$${price ? price.toFixed(2) : 'N/A'}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    const str = price.toString().split('.')[1];
    const leadingZeros = str.match(/^0+/)?.[0].length || 0;
    const significant = str.replace(/^0+/, '').slice(0, 4);
    return `$0.0<sub>${leadingZeros}</sub>${significant}`;
}

function drawMiniChart(canvas, sparkline, change24h) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width = 60;
    const height = canvas.height = 20;
    ctx.clearRect(0, 0, width, height);
    if (!sparkline || !sparkline.length) return;
    const maxPrice = Math.max(...sparkline);
    const minPrice = Math.min(...sparkline);
    const scaleY = (height - 2) / (maxPrice - minPrice || 1);
    ctx.beginPath();
    ctx.strokeStyle = change24h >= 0 ? '#00CC00' : '#FF486B';
    ctx.lineWidth = 1;
    sparkline.forEach((price, i) => {
        const x = (i / (sparkline.length - 1)) * (width - 1);
        const y = height - 1 - (price - minPrice) * scaleY;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function updateCustomWatchlist() {
    const tbody = document.getElementById('customWatchlistBody');
    tbody.innerHTML = '';
    customWatchlist.forEach((coin, index) => {
        const trendColor = coin.change24h >= 0 ? '#00CC00' : '#FF486B';
        const row = document.createElement('div');
        row.className = 'watchlist-row';
        row.draggable = true;
        row.dataset.index = index;
        row.dataset.coinId = coin.id;
        row.innerHTML = `
            <div>
                <img src="${coin.image}" alt="${coin.name}" class="coin-logo">
                ${coin.name || 'Unknown'}
            </div>
            <div>${coin.symbol || '?'}</div>
            <div>${formatPrice(coin.price)}</div>
            <div style="color: ${trendColor}">${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%</div>
            <div>${formatMarketCap(coin.marketCap)}</div>
            <div>
                <canvas class="trend-chart" width="60" height="20"></canvas>
                <span class="remove-coin" onclick="removeCoin(${index})">×</span>
            </div>
        `;
        tbody.appendChild(row);
        const canvas = row.querySelector('.trend-chart');
        drawMiniChart(canvas, coin.sparkline, coin.change24h);
    });
    makeSortable(document.getElementById('customWatchlistBody'), customWatchlist, updateCustomWatchlist);
    saveCustomWatchlist();
    lastUpdate = Date.now();
    document.getElementById('last-updated').textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;
}

function updateTrendingWatchlist() {
    const tbody = document.getElementById('trendingWatchlistBody');
    tbody.innerHTML = '';
    const activeList = activeTrendingTab === 'crypto' ? trendingCrypto : activeTrendingTab === 'eth' ? trendingETH : trendingSOL;
    if (!activeList || !activeList.length) return;
    activeList.slice(0, 10).forEach((coin) => {
        const trendColor = coin.change24h >= 0 ? '#00CC00' : '#FF486B';
        const row = document.createElement('div');
        row.className = 'watchlist-row';
        row.innerHTML = `
            <div>
                <img src="${coin.image}" alt="${coin.name}" class="coin-logo">
                ${coin.name || 'Unknown'}
            </div>
            <div>${coin.symbol || '?'}</div>
            <div>${formatPrice(coin.price)}</div>
            <div style="color: ${trendColor}">${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%</div>
            <div>${formatMarketCap(coin.marketCap)}</div>
            <div>
                <canvas class="trend-chart" width="60" height="20"></canvas>
            </div>
        `;
        tbody.appendChild(row);
        const canvas = row.querySelector('.trend-chart');
        drawMiniChart(canvas, coin.sparkline, coin.change24h);
    });
}

const debouncedCustomUpdate = debounce(updateCustomWatchlist, 500);
const debouncedTrendingUpdate = debounce(updateTrendingWatchlist, 500);

function makeSortable(container, list, updateFunc) {
    let draggedItem = null;
    let dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';

    container.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('.watchlist-row');
        if (draggedItem) setTimeout(() => draggedItem.style.opacity = '0.5', 0);
    });

    container.addEventListener('dragend', () => {
        if (!draggedItem) return;
        draggedItem.style.opacity = '1';
        dropIndicator.remove();
        const newOrder = Array.from(container.children).map(row => {
            const coinId = row.dataset.coinId;
            return list.find(coin => coin.id === coinId);
        });
        list.splice(0, list.length, ...newOrder.filter(coin => coin));
        draggedItem = null;
        updateFunc();
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem) return;
        const target = e.target.closest('.watchlist-row');
        const allRows = Array.from(container.children);
        if (!target && allRows.length > 0) {
            container.insertBefore(dropIndicator, allRows[0]);
        } else if (target && draggedItem !== target) {
            const targetRect = target.getBoundingClientRect();
            const midPoint = targetRect.top + targetRect.height / 2;
            if (e.clientY < midPoint) {
                container.insertBefore(dropIndicator, target);
            } else {
                target.after(dropIndicator);
            }
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedItem) return;
        const target = e.target.closest('.watchlist-row');
        const allRows = Array.from(container.children);
        if (!target && allRows.length > 0) {
            container.insertBefore(draggedItem, allRows[0]);
        } else if (target && draggedItem !== target) {
            const draggedIndex = allRows.indexOf(draggedItem);
            const targetIndex = allRows.indexOf(target);
            if (draggedIndex < targetIndex) {
                target.after(draggedItem);
            } else {
                target.before(draggedItem);
            }
        }
    });
}

function rankSuggestions(input) {
    if (!input || !coinList.length) return [];
    const lowerInput = input.toLowerCase();
    return coinList
        .map(coin => {
            const symbolMatch = coin.symbol.toLowerCase() === lowerInput ? 5 : coin.symbol.toLowerCase().includes(lowerInput) ? 2 : 0;
            const nameMatch = coin.name.toLowerCase() === lowerInput ? 4 : coin.name.toLowerCase().includes(lowerInput) ? 1 : 0;
            const idMatch = coin.id === lowerInput ? 3 : coin.id.includes(lowerInput) ? 1 : 0;
            const contractMatch = coin.platforms && Object.values(coin.platforms).some(addr => addr.toLowerCase() === lowerInput) ? 10 : 0;
            const cached = coinCache.get(coin.id);
            const marketCapWeight = cached && cached.marketCap ? Math.log10(cached.marketCap) / 10 : 0;
            const score = Math.max(symbolMatch, nameMatch, idMatch, contractMatch) + marketCapWeight;
            if (contractMatch && score < 10) console.log(`Contract match for ${lowerInput}: ${coin.name} (${coin.id}), score: ${score}`);
            return score > 0 ? { ...coin, score } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 5);
}

function showSuggestions(input) {
    const dropdown = document.getElementById('suggestions');
    dropdown.innerHTML = '';
    if (input.length < 1) return;

    const matches = rankSuggestions(input);
    if (!matches.length) {
        dropdown.innerHTML = '<div class="suggestion">No matches found</div>';
        return;
    }

    matches.forEach(coin => {
        const cachedCoin = coinCache.get(coin.id) || coin;
        const option = document.createElement('div');
        option.innerHTML = `
            <img src="${cachedCoin.image || 'https://placehold.co/24x24'}" alt="${coin.name}" class="dropdown-logo">
            ${coin.name} (${coin.symbol.toUpperCase()})
        `;
        option.className = 'suggestion';
        option.dataset.coinId = coin.id;
        option.onclick = () => {
            document.getElementById('coinInput').value = coin.id;
            dropdown.innerHTML = '';
            addCoin(coin.id);
        };
        dropdown.appendChild(option);
    });
}

async function addCoin(coinIdFromDropdown = null) {
    const input = document.getElementById('coinInput');
    const query = coinIdFromDropdown || input.value.trim().toLowerCase();
    const dropdown = document.getElementById('suggestions');
    const addButton = document.querySelector('.watchlist-controls button');

    if (!query || customWatchlist.some(coin => coin.id === query)) {
        alert('Please enter a valid coin or it already exists!');
        return;
    }

    addButton.disabled = true;
    addButton.textContent = 'Adding...';

    let coinId = coinIdFromDropdown;
    if (!coinId) {
        const isContract = /^0x[a-fA-F0-9]{40}$/.test(query) || /^[A-Za-z0-9]{32,44}$/.test(query);
        if (isContract) {
            const coin = coinList.find(c => c.platforms && Object.values(c.platforms).some(addr => addr.toLowerCase() === query));
            if (coin) {
                coinId = coin.id;
                console.log(`Matched contract ${query} to ${coin.name} (${coin.id})`);
            } else {
                alert('Contract not found! Ensure the address is correct.');
                addButton.disabled = false;
                addButton.textContent = 'Add';
                return;
            }
        } else {
            const exactMatch = coinList.find(coin =>
                coin.id === query || coin.symbol.toLowerCase() === query || coin.name.toLowerCase() === query
            );
            if (!exactMatch) {
                alert('Coin not found! Try: BTC, ETH, XRP, PEPE');
                addButton.disabled = false;
                addButton.textContent = 'Add';
                return;
            }
            coinId = exactMatch.id;
        }
    }

    try {
        const coinData = await fetchCryptoData(coinId);
        if (coinData) {
            coinData.id = coinId;
            customWatchlist.push(coinData);
            updateCustomWatchlist();
            input.value = '';
            dropdown.innerHTML = '';
        } else {
            alert('Failed to fetch coin data. Try again.');
        }
    } catch (error) {
        console.error('Error adding coin:', error);
        alert('An error occurred while adding the coin.');
    } finally {
        addButton.disabled = false;
        addButton.textContent = 'Add';
    }
}

function removeCoin(index) {
    customWatchlist.splice(index, 1);
    updateCustomWatchlist();
}

function saveCustomWatchlist() {
    localStorage.setItem('customWatchlist', JSON.stringify(customWatchlist.map(coin => coin.id)));
    customWatchlist.forEach(coin => setCachedData(`coin_${coin.id}`, coin)); // Cache full coin data
}

async function loadCustomWatchlist() {
    let savedIds = JSON.parse(localStorage.getItem('customWatchlist') || '[]');
    if (savedIds.length === 0) {
        savedIds = JSON.parse(localStorage.getItem('cryptoWatchlist') || '[]');
        if (savedIds.length > 0) {
            console.log('Migrating old watchlist data...');
            localStorage.setItem('customWatchlist', JSON.stringify(savedIds));
            localStorage.removeItem('cryptoWatchlist');
        }
    }
    if (savedIds.length > 0) {
        customWatchlist = [];
        for (const id of savedIds) {
            let coinData = await fetchCryptoData(id);
            if (!coinData) {
                coinData = getCachedData(`coin_${id}`); // Fallback to cached data
            }
            if (coinData) {
                coinData.id = id;
                customWatchlist.push(coinData);
            }
        }
        updateCustomWatchlist();
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

initPage();

setInterval(async () => {
    const now = Date.now();
    if (now - lastUpdate < 60000) return;
    console.log('Refreshing trending watchlists...');
    await fetchTrendingWatchlists();
    await fetchHeaderPrices();
    await fetchFearAndGreed();
    await updatePortfolio();
}, 60000);

document.getElementById('coinInput').addEventListener('input', debounce((e) => {
    showSuggestions(e.target.value.toLowerCase());
}, 300));

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
    });

    const tabs = document.querySelectorAll('.trending-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            activeTrendingTab = e.target.dataset.tab;
            updateTrendingWatchlist();
        });
    });

    const toggles = document.querySelectorAll('.toggle-section');
    toggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            const section = document.getElementById(targetId);
            section.classList.toggle('collapsed');
            e.target.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
        });
    });
});
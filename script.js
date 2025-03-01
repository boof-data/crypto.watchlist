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

async function fetchCoinList() {
    try {
        if (coinList.length === 0) {
            const response = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
            coinList = await response.json();
            console.log('Full coin list fetched:', coinList.slice(0, 5));
        }
        const responses = await Promise.all([
            fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true'),
            fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=true')
        ]);
        const data = await Promise.all(responses.map(res => res.json()));
        const markets = [].concat(...data);
        markets.forEach(coin => coinCache.set(coin.id, {
            name: coin.name,
            symbol: coin.symbol.toUpperCase(),
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            sparkline: coin.sparkline_in_7d ? coin.sparkline_in_7d.price.slice(-24) : [],
            image: coin.image
        }));
        console.log('Markets fetched (500 coins):', markets.slice(0, 5));
    } catch (error) {
        console.error('Failed to fetch coin list:', error);
    }
}

async function fetchCryptoData(coinId) {
    if (coinCache.has(coinId)) {
        const cached = coinCache.get(coinId);
        const now = Date.now();
        if (now - (cached.lastFetched || 0) < 60000) return cached;
    }
    return new Promise((resolve) => {
        requestQueue = requestQueue.then(async () => {
            await new Promise(resolve => setTimeout(resolve, 250));
            try {
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`
                );
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                const data = await response.json();
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
                resolve(coinData);
            } catch (error) {
                console.error(`Failed to fetch ${coinId}: ${error.message}`);
                const cached = coinCache.get(coinId);
                resolve(cached || null);
            }
        });
    });
}

async function fetchTrendingWatchlists() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true');
        const coins = await response.json();
        const nonStableCoins = coins.filter(coin => !stableCoinIds.includes(coin.id));
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
        updateTrendingWatchlist();
    } catch (error) {
        console.error('Failed to fetch trending watchlists:', error);
    }
}

async function fetchFearAndGreed() {
    try {
        const response = await fetch('https://api.alternative.me/fng/');
        const data = await response.json();
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
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd');
        const data = await response.json();
        document.getElementById('btc-price').innerHTML = `<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" alt="BTC" class="token-logo"> $${data.bitcoin.usd.toLocaleString()}`;
        document.getElementById('eth-price').innerHTML = `<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" class="token-logo"> $${data.ethereum.usd.toLocaleString()}`;
        document.getElementById('sol-price').innerHTML = `<img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" class="token-logo"> $${data.solana.usd.toLocaleString()}`;
    } catch (error) {
        console.error('Failed to fetch header prices:', error);
    }
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
                addButton.textContent = 'Add to Watchlist';
                return;
            }
        } else {
            const exactMatch = coinList.find(coin =>
                coin.id === query || coin.symbol.toLowerCase() === query || coin.name.toLowerCase() === query
            );
            if (!exactMatch) {
                alert('Coin not found! Try: BTC, ETH, XRP, PEPE');
                addButton.disabled = false;
                addButton.textContent = 'Add to Watchlist';
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
        addButton.textContent = 'Add to Watchlist';
    }
}

function removeCoin(index) {
    customWatchlist.splice(index, 1);
    updateCustomWatchlist();
}

function saveCustomWatchlist() {
    localStorage.setItem('customWatchlist', JSON.stringify(customWatchlist.map(coin => coin.id)));
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
            const coinData = await fetchCryptoData(id);
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

fetchCoinList().then(() => {
    loadCustomWatchlist();
    fetchTrendingWatchlists();
    fetchFearAndGreed();
    fetchHeaderPrices();
});

setInterval(async () => {
    const now = Date.now();
    if (now - lastUpdate < 60000) return;
    console.log('Refreshing trending watchlists...');
    await fetchTrendingWatchlists();
    fetchHeaderPrices();
    fetchFearAndGreed();
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
});
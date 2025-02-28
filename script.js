let watchlist = [];
let coinList = [];
let coinCache = new Map();

async function fetchCoinList() {
    try {
        // Fetch top 250 coins with market data for thumbnails and initial data
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true');
        const marketData = await response.json();
        coinList = marketData;
        console.log('Initial coin list fetched (250 coins):', coinList.slice(0, 5));
        // Store in cache for quick access
        coinList.forEach(coin => coinCache.set(coin.id, {
            name: coin.name,
            symbol: coin.symbol.toUpperCase(),
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            sparkline: coin.sparkline_in_7d.price.slice(-24),
            image: coin.image
        }));
    } catch (error) {
        console.error('Failed to fetch initial coin list:', error);
        // Fallback to full list if needed
        const fallbackResponse = await fetch('https://api.coingecko.com/api/v3/coins/list');
        coinList = await fallbackResponse.json();
        console.log('Fallback coin list fetched:', coinList.slice(0, 5));
    }
}

async function fetchCryptoData(coinId, retries = 3) {
    if (coinCache.has(coinId)) return coinCache.get(coinId);
    for (let i = 0; i <= retries; i++) {
        try {
            await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
            const response = await fetch(
                `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`
            );
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            const coinData = {
                name: data.name,
                symbol: data.symbol.toUpperCase(),
                price: data.market_data.current_price.usd,
                change24h: data.market_data.price_change_percentage_24h,
                marketCap: data.market_data.market_cap.usd,
                sparkline: data.market_data.sparkline_7d.price.slice(-24),
                image: data.image.thumb
            };
            coinCache.set(coinId, coinData);
            console.log(`Fetched ${coinId} successfully`);
            return coinData;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed for ${coinId}: ${error.message}`);
            if (i === retries) {
                // Fallback to coinList if available
                const fallback = coinList.find(coin => coin.id === coinId);
                if (fallback && fallback.current_price) {
                    const coinData = {
                        name: fallback.name,
                        symbol: fallback.symbol.toUpperCase(),
                        price: fallback.current_price,
                        change24h: fallback.price_change_percentage_24h,
                        marketCap: fallback.market_cap,
                        sparkline: fallback.sparkline_in_7d.price.slice(-24),
                        image: fallback.image
                    };
                    coinCache.set(coinId, coinData);
                    return coinData;
                }
                return null;
            }
        }
    }
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
    if (!sparkline.length) return;
    const maxPrice = Math.max(...sparkline);
    const minPrice = Math.min(...sparkline);
    const scaleY = (height - 2) / (maxPrice - minPrice || 1);
    ctx.beginPath();
    ctx.strokeStyle = change24h >= 0 ? '#00cc00' : '#ff4444';
    ctx.lineWidth = 1;
    sparkline.forEach((price, i) => {
        const x = (i / (sparkline.length - 1)) * (width - 1);
        const y = height - 1 - (price - minPrice) * scaleY;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function updateWatchlistTable() {
    const tbody = document.getElementById('watchlistBody');
    tbody.innerHTML = '';
    watchlist.forEach((coin, index) => {
        const trendColor = coin.change24h >= 0 ? '#00cc00' : '#ff4444';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <img src="${coin.image}" alt="${coin.name}" class="coin-logo">
                ${coin.name || 'Unknown'}
            </td>
            <td>${coin.symbol || '?'}</td>
            <td>${formatPrice(coin.price)}</td>
            <td style="color: ${trendColor}">${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%</td>
            <td>$${coin.marketCap ? coin.marketCap.toLocaleString() : 'N/A'}</td>
            <td>
                <canvas class="trend-chart" width="60" height="20"></canvas>
                <span class="remove-coin" onclick="removeCoin(${index})">×</span>
            </td>
        `;
        tbody.appendChild(row);
        const canvas = row.querySelector('.trend-chart');
        drawMiniChart(canvas, coin.sparkline, coin.change24h);
    });
    saveWatchlist();
}

function rankSuggestions(input) {
    if (!input || !coinList.length) return [];
    const lowerInput = input.toLowerCase();
    return coinList
        .map(coin => {
            const symbolMatch = coin.symbol.toLowerCase() === lowerInput ? 3 : coin.symbol.toLowerCase().includes(lowerInput) ? 1 : 0;
            const nameMatch = coin.name.toLowerCase() === lowerInput ? 2 : coin.name.toLowerCase().includes(lowerInput) ? 1 : 0;
            const idMatch = coin.id === lowerInput ? 3 : coin.id.includes(lowerInput) ? 1 : 0;
            const score = symbolMatch + nameMatch + idMatch;
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

    matches.forEach(async (coin) => {
        const cachedCoin = coinCache.get(coin.id) || coin;
        const option = document.createElement('div');
        option.innerHTML = `
            <img src="${cachedCoin.image || 'https://via.placeholder.com/24'}" alt="${coin.name}" class="dropdown-logo">
            ${coin.name} (${coin.symbol.toUpperCase()})
        `;
        option.className = 'suggestion';
        option.onclick = () => {
            document.getElementById('coinInput').value = coin.id;
            dropdown.innerHTML = '';
            addCoin();
        };
        dropdown.appendChild(option);
    });
}

async function addCoin() {
    const input = document.getElementById('coinInput');
    const query = input.value.trim().toLowerCase();
    const dropdown = document.getElementById('suggestions');
    const addButton = document.querySelector('.watchlist-controls button');

    if (!query || watchlist.some(coin => coin.id === query)) {
        alert('Please enter a valid coin or it already exists!');
        return;
    }

    const exactMatch = coinList.find(coin =>
        coin.id === query || coin.symbol.toLowerCase() === query || coin.name.toLowerCase() === query
    );
    if (!exactMatch) {
        alert('Coin not found! Try: BTC, ETH, XRP, PEPE');
        return;
    }
    const coinId = exactMatch.id;

    addButton.disabled = true;
    addButton.textContent = 'Adding...';

    try {
        const coinData = await fetchCryptoData(coinId);
        if (coinData) {
            coinData.id = coinId;
            watchlist.push(coinData);
            updateWatchlistTable();
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
    watchlist.splice(index, 1);
    updateWatchlistTable();
}

function saveWatchlist() {
    localStorage.setItem('cryptoWatchlist', JSON.stringify(watchlist.map(coin => coin.id)));
}

async function loadWatchlist() {
    const savedIds = JSON.parse(localStorage.getItem('cryptoWatchlist') || '[]');
    if (savedIds.length > 0) {
        watchlist = [];
        for (const id of savedIds) {
            const coinData = await fetchCryptoData(id);
            if (coinData) {
                coinData.id = id;
                watchlist.push(coinData);
            }
        }
        updateWatchlistTable();
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

fetchCoinList().then(() => loadWatchlist());

setInterval(async () => {
    console.log('Refreshing watchlist...');
    for (let i = 0; i < watchlist.length; i++) {
        const coin = watchlist[i];
        const updatedCoin = await fetchCryptoData(coin.id);
        if (updatedCoin) {
            watchlist[i] = { ...coin, ...updatedCoin };
        }
    }
    updateWatchlistTable();
}, 30000);

document.getElementById('coinInput').addEventListener('input', debounce((e) => {
    showSuggestions(e.target.value.toLowerCase());
}, 300));
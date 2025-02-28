let watchlist = [];
let coinList = [];
let coinCache = new Map();
let requestQueue = Promise.resolve();

async function fetchCoinList() {
    try {
        const responses = await Promise.all([
            fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true'),
            fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&sparkline=true')
        ]);
        const data = await Promise.all(responses.map(res => res.json()));
        coinList = [].concat(...data);
        coinList.forEach(coin => coinCache.set(coin.id, {
            name: coin.name,
            symbol: coin.symbol.toUpperCase(),
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            sparkline: coin.sparkline_in_7d.price.slice(-24),
            image: coin.image
        }));
        console.log('Coin list fetched (500 coins):', coinList.slice(0, 5));
    } catch (error) {
        console.error('Failed to fetch markets:', error);
        const fallback = await fetch('https://api.coingecko.com/api/v3/coins/list');
        coinList = await fallback.json();
    }
}

async function fetchCryptoData(coinId) {
    if (coinCache.has(coinId)) return coinCache.get(coinId);
    return new Promise((resolve) => {
        requestQueue = requestQueue.then(async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
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
                resolve(coinData);
            } catch (error) {
                console.error(`Failed to fetch ${coinId}: ${error.message}`);
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
                    resolve(coinData);
                } else {
                    resolve(null);
                }
            }
        });
    });
}

async function fetchRealTimePrices() {
    if (!watchlist.length) return;
    const ids = watchlist.map(coin => coin.id).join(',');
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
        );
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        watchlist.forEach(coin => {
            if (data[coin.id]) {
                coin.price = data[coin.id].usd;
                coin.change24h = data[coin.id].usd_24h_change;
            }
        });
        updateWatchlistTable();
    } catch (error) {
        console.error('Failed to fetch real-time prices:', error);
    }
}

async function fetchCoinByContract(platform, address) {
    return new Promise((resolve) => {
        requestQueue = requestQueue.then(async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address.toLowerCase()}?localization=false&tickers=false&market_data=true&sparkline=true`
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
                    sparkline: data.market_data.sparkline_7d.price.slice(-24),
                    image: data.image.thumb
                };
                coinCache.set(data.id, coinData);
                console.log(`Fetched contract ${address} on ${platform}: ${data.name}`);
                resolve(coinData);
            } catch (error) {
                console.error(`Failed to fetch contract ${address} on ${platform}: ${error.message}`);
                resolve(null);
            }
        });
    });
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
    ctx.strokeStyle = change24h >= 0 ? '#00CC00' : '#FF486B';
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
        const trendColor = coin.change24h >= 0 ? '#00CC00' : '#FF486B';
        const row = document.createElement('div');
        row.className = 'watchlist-row';
        row.draggable = true;
        row.dataset.index = index;
        row.innerHTML = `
            <div>
                <img src="${coin.image}" alt="${coin.name}" class="coin-logo">
                ${coin.name || 'Unknown'}
            </div>
            <div>${coin.symbol || '?'}</div>
            <div>${formatPrice(coin.price)}</div>
            <div style="color: ${trendColor}">${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%</div>
            <div>$${coin.marketCap ? coin.marketCap.toLocaleString() : 'N/A'}</div>
            <div>
                <canvas class="trend-chart" width="60" height="20"></canvas>
                <span class="remove-coin" onclick="removeCoin(${index})">×</span>
            </div>
        `;
        tbody.appendChild(row);
        const canvas = row.querySelector('.trend-chart');
        drawMiniChart(canvas, coin.sparkline, coin.change24h);
    });
    makeSortable();
    saveWatchlist();
    document.getElementById('last-updated').textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;
}

function makeSortable() {
    const tbody = document.getElementById('watchlistBody');
    let draggedItem = null;
    let dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    tbody.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('.watchlist-row');
        setTimeout(() => draggedItem.style.opacity = '0.5', 0);
    });
    tbody.addEventListener('dragend', () => {
        draggedItem.style.opacity = '1';
        dropIndicator.remove();
        draggedItem = null;
        const newOrder = Array.from(tbody.children).map(row => watchlist[row.dataset.index]);
        watchlist = newOrder;
        updateWatchlistTable();
    });
    tbody.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target.closest('.watchlist-row');
        if (target && draggedItem !== target) {
            const allRows = Array.from(tbody.children);
            const targetRect = target.getBoundingClientRect();
            const midPoint = targetRect.top + targetRect.height / 2;
            if (e.clientY < midPoint) {
                tbody.insertBefore(dropIndicator, target);
            } else {
                target.after(dropIndicator);
            }
        }
    });
    tbody.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.watchlist-row');
        if (target && draggedItem !== target) {
            const allRows = Array.from(tbody.children);
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

    matches.forEach(coin => {
        const cachedCoin = coinCache.get(coin.id) || coin;
        const option = document.createElement('div');
        option.innerHTML = `
            <img src="${cachedCoin.image || 'https://via.placeholder.com/24'}" alt="${coin.name}" class="dropdown-logo">
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

    if (!query || watchlist.some(coin => coin.id === query)) {
        alert('Please enter a valid coin or it already exists!');
        return;
    }

    addButton.disabled = true;
    addButton.textContent = 'Adding...';

    const isContract = /^0x[a-fA-F0-9]{40}$/.test(query) || /^[A-Za-z0-9]{32,44}$/.test(query);
    if (isContract) {
        const platforms = ['ethereum', 'solana'];
        for (const platform of platforms) {
            const coinData = await fetchCoinByContract(platform, query);
            if (coinData) {
                watchlist.push(coinData);
                updateWatchlistTable();
                input.value = '';
                dropdown.innerHTML = '';
                addButton.disabled = false;
                addButton.textContent = 'Add to Watchlist';
                return;
            }
        }
        alert('Contract not found on Ethereum or Solana! Ensure the address is correct.');
        addButton.disabled = false;
        addButton.textContent = 'Add to Watchlist';
        return;
    }

    const exactMatch = coinList.find(coin =>
        coin.id === query || coin.symbol.toLowerCase() === query || coin.name.toLowerCase() === query
    );
    if (!exactMatch) {
        alert('Coin not found! Try: BTC, ETH, XRP, PEPE');
        addButton.disabled = false;
        addButton.textContent = 'Add to Watchlist';
        return;
    }
    const coinId = exactMatch.id;

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

// Real-time price updates every 10 seconds
setInterval(fetchRealTimePrices, 10000);

document.getElementById('coinInput').addEventListener('input', debounce((e) => {
    showSuggestions(e.target.value.toLowerCase());
}, 300));

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
    });
});
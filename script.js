let watchlist = [];
let coinList = [];

async function fetchCoinList() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true');
        coinList = await response.json(); // Include sparkline for trend data
    } catch (error) {
        console.error('Failed to fetch coin list:', error);
    }
}

async function fetchCryptoData(coinId) {
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`
        );
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return {
            name: data.name,
            symbol: data.symbol.toUpperCase(),
            price: data.market_data.current_price.usd,
            change24h: data.market_data.price_change_percentage_24h,
            marketCap: data.market_data.market_cap.usd,
            sparkline: data.market_data.sparkline_7d.price.slice(-24) // Last 24 hours of 7-day data
        };
    } catch (error) {
        console.error(`Failed to fetch ${coinId}: ${error.message}`);
        return null;
    }
}

function updateWatchlistTable() {
    const tbody = document.getElementById('watchlistBody');
    tbody.innerHTML = '';
    watchlist.forEach((coin, index) => {
        const trendColor = coin.change24h >= 0 ? 'green' : 'red';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${coin.name || 'Unknown'}</td>
            <td>${coin.symbol || '?'}</td>
            <td>$${coin.price ? coin.price.toFixed(2) : 'N/A'}</td>
            <td style="color: ${trendColor}">${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%</td>
            <td>$${coin.marketCap ? coin.marketCap.toLocaleString() : 'N/A'}</td>
            <td>
                <div class="trend-indicator" style="background-color: ${trendColor};"></div>
                <span class="remove-coin" onclick="removeCoin(${index})">×</span>
            </td>
        `;
        tbody.appendChild(row);
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
        .sort((a, b) => {
            const capDiff = (b.market_cap || 0) - (a.market_cap || 0);
            return capDiff !== 0 ? capDiff : b.score - a.score || a.name.localeCompare(b.name);
        })
        .slice(0, 5);
}

function showSuggestions(input) {
    const dropdown = document.getElementById('suggestions');
    dropdown.innerHTML = '';
    if (input.length < 1) return;

    const matches = rankSuggestions(input);
    if (!matches.length) return;

    matches.forEach(coin => {
        const option = document.createElement('div');
        option.textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
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

    let coinId = query;
    const exactMatch = coinList.find(coin =>
        coin.id === query ||
        coin.symbol.toLowerCase() === query ||
        coin.name.toLowerCase() === query
    );
    if (!exactMatch) {
        alert('Coin not found! Try: BTC, ETH, bitcoin');
        return;
    }
    coinId = exactMatch.id;

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

fetchCoinList();

setInterval(async () => {
    console.log('Refreshing watchlist...');
    for (let i = 0; i < watchlist.length; i++) {
        const coin = watchlist[i];
        const updatedCoin = await fetchCryptoData(coin.id);
        if (updatedCoin) {
            watchlist[i] = { ...coin, price: updatedCoin.price, change24h: updatedCoin.change24h, marketCap: updatedCoin.marketCap, sparkline: updatedCoin.sparkline };
        }
    }
    updateWatchlistTable();
}, 30000);

document.getElementById('coinInput').addEventListener('input', (e) => {
    showSuggestions(e.target.value.toLowerCase());
});
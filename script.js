let watchlist = [];
let coinList = []; // Cache of all coins for ticker/name lookup

// Fetch the full coin list once on load
async function fetchCoinList() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/list');
        coinList = await response.json();
    } catch (error) {
        console.error('Failed to fetch coin list:', error);
    }
}

async function fetchCryptoData(coinId) {
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
        );
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        return {
            name: data.name,
            symbol: data.symbol.toUpperCase(),
            price: data.market_data.current_price.usd,
            change24h: data.market_data.price_change_percentage_24h
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
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${coin.name || 'Unknown'}</td>
            <td>${coin.symbol || '?'}</td>
            <td>$${coin.price ? coin.price.toFixed(2) : 'N/A'}</td>
            <td style="color: ${coin.change24h >= 0 ? 'green' : 'red'}">
                ${coin.change24h ? coin.change24h.toFixed(2) : 'N/A'}%
            </td>
            <td>
                <button class="remove-btn" onclick="removeCoin(${index})">Remove</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showSuggestions(input) {
    const dropdown = document.getElementById('suggestions');
    dropdown.innerHTML = '';
    if (input.length < 2 || !coinList.length) return;

    const matches = coinList.filter(coin => 
        coin.id.includes(input) || 
        coin.symbol.toLowerCase().includes(input) || 
        coin.name.toLowerCase().includes(input)
    ).slice(0, 5); // Limit to 5 suggestions

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
    if (!query || watchlist.some(coin => coin.id === query)) {
        alert('Please enter a valid coin or it already exists!');
        return;
    }

    // Try exact ID first, then ticker/name lookup
    let coinId = query;
    if (!coinList.some(coin => coin.id === query)) {
        const match = coinList.find(coin => 
            coin.symbol.toLowerCase() === query || 
            coin.name.toLowerCase() === query
        );
        if (match) coinId = match.id;
    }

    const coinData = await fetchCryptoData(coinId);
    if (coinData) {
        coinData.id = coinId;
        watchlist.push(coinData);
        updateWatchlistTable();
        input.value = '';
    } else {
        alert('Coin not found! Try: BTC, ETH, bitcoin');
    }
}

function removeCoin(index) {
    watchlist.splice(index, 1);
    updateWatchlistTable();
}

// Load coin list on startup
fetchCoinList();

// Refresh prices every 30 seconds
setInterval(async () => {
    console.log('Refreshing watchlist...');
    for (let i = 0; i < watchlist.length; i++) {
        const coin = watchlist[i];
        const updatedCoin = await fetchCryptoData(coin.id);
        if (updatedCoin) {
            watchlist[i] = { ...coin, price: updatedCoin.price, change24h: updatedCoin.change24h };
        }
    }
    updateWatchlistTable();
}, 30000);

// Input listener for suggestions
document.getElementById('coinInput').addEventListener('input', (e) => {
    showSuggestions(e.target.value.toLowerCase());
});
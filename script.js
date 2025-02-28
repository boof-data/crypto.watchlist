let watchlist = [];

async function fetchCryptoData(coinId) {
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
        );
        const data = await response.json();
        return {
            name: data.name,
            symbol: data.symbol.toUpperCase(),
            price: data.market_data.current_price.usd,
            change24h: data.market_data.price_change_percentage_24h
        };
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

function updateWatchlistTable() {
    const tbody = document.getElementById('watchlistBody');
    tbody.innerHTML = '';

    watchlist.forEach((coin, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${coin.name}</td>
            <td>${coin.symbol}</td>
            <td>$${coin.price.toFixed(2)}</td>
            <td style="color: ${coin.change24h >= 0 ? 'green' : 'red'}">
                ${coin.change24h.toFixed(2)}%
            </td>
            <td>
                <button class="remove-btn" onclick="removeCoin(${index})">Remove</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function addCoin() {
    const input = document.getElementById('coinInput');
    const coinId = input.value.trim().toLowerCase();

    if (!coinId || watchlist.some(coin => coin.id === coinId)) {
        alert('Please enter a valid coin ID or it already exists in the watchlist!');
        return;
    }

    const coinData = await fetchCryptoData(coinId);
    if (coinData) {
        coinData.id = coinId; // Store the ID for reference
        watchlist.push(coinData);
        updateWatchlistTable();
        input.value = '';
    } else {
        alert('Coin not found! Try IDs like: bitcoin, ethereum, dogecoin');
    }
}

function removeCoin(index) {
    watchlist.splice(index, 1);
    updateWatchlistTable();
}

// Refresh prices every 30 seconds
setInterval(async () => {
    const updatedWatchlist = [];
    for (const coin of watchlist) {
        const updatedCoin = await fetchCryptoData(coin.id);
        if (updatedCoin) updatedWatchlist.push({ ...updatedCoin, id: coin.id });
    }
    watchlist = updatedWatchlist;
    updateWatchlistTable();
}, 30000);
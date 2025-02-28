let watchlist = [];

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

async function addCoin() {
    const input = document.getElementById('coinInput');
    const coinId = input.value.trim().toLowerCase();
    if (!coinId || watchlist.some(coin => coin.id === coinId)) {
        alert('Please enter a valid coin ID or it already exists!');
        return;
    }

    const coinData = await fetchCryptoData(coinId);
    if (coinData) {
        coinData.id = coinId;
        watchlist.push(coinData);
        updateWatchlistTable();
        input.value = '';
    } else {
        alert('Coin not found! Try: bitcoin, eth, dogecoin');
    }
}

function removeCoin(index) {
    watchlist.splice(index, 1);
    updateWatchlistTable();
}

// Refresh prices every 30 seconds, preserving coins
setInterval(async () => {
    console.log('Refreshing watchlist...');
    for (let i = 0; i < watchlist.length; i++) {
        const coin = watchlist[i];
        const updatedCoin = await fetchCryptoData(coin.id);
        if (updatedCoin) {
            watchlist[i] = { ...coin, price: updatedCoin.price, change24h: updatedCoin.change24h };
        } else {
            console.log(`Keeping old data for ${coin.id}`);
        }
    }
    updateWatchlistTable();
}, 30000);
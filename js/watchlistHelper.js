class Asset {
  constructor(symbol, name, type, amount, precision) {
    this.symbol = symbol;
    this.name = name;
    this.type = type;
    this.amount = amount;
    this.precision = precision;
    this.change = null;
    this.price = null;
    this.firstUpdate = false;

    const displaySymbol = this.isCrypto()
      ? this.symbol.slice(0, this.symbol.length - 7)
      : this.symbol;
    const self = this;
    $('<tr></tr>')
      .attr('id', this.symbol)
      .click(function () {
        $('#editForm').removeClass('hidden');
        $('#editFormHeader').html(self.symbol);
        $('#amountDisplay').html(
          new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 8,
          }).format(self.amount)
        );
      })
      .html(
        `<td class="nameCell">
          <div id="${this.symbol}-name" class="nameData">
            <div>${displaySymbol}</div>
            <div class="fullName">${this.name}</div></div>
        </td>
        <td class="priceCell">
          <div id="${this.symbol}-price" class="priceData"></div>
          </td>
          <td class="changeCell">
            <div id="${this.symbol}-change" class="changeData"></div>
            </td>
        <td class="valueCell">
          <div id="${this.symbol}-value" class="valueData"></div>
        </td>`
      )
      .appendTo('#tableBody');
  }

  isCrypto() {
    return this.type == 'crypto';
  }

  isMutualFund() {
    return this.type == 'mutualFund';
  }

  isStock() {
    return this.type == 'stock';
  }

  getValue() {
    return round(this.price * this.amount, 2);
  }

  checkUpdateValid() {
    const t = new Date();
    if (this.isMutualFund()) {
      return (
        this.firstUpdate == false ||
        (new Date(t.getFullYear(), t.getMonth(), t.getDate(), 17, 30) <= t &&
          new Date(t.getFullYear(), t.getMonth(), t.getDate(), 21) >= t &&
          ![0, 6].includes(t.getDay()))
      );
    } else if (this.isStock()) {
      return (
        this.firstUpdate == false ||
        (new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9, 30) <= t &&
          new Date(t.getFullYear(), t.getMonth(), t.getDate(), 17, 30) >= t &&
          ![0, 6].includes(t.getDay()))
      );
    }
  }

  static fromObject(object) {
    return new Asset(
      object.symbol,
      object.name,
      object.type,
      object.amount,
      object.precision
    );
  }
}

function loadWebSocket() {
  ws = new WebSocket('wss://ws-feed.pro.coinbase.com');
  ws.onopen = function () {
    for (const [symbol, asset] of assetMap) {
      if (asset.isCrypto()) {
        const coinbaseId = `${symbol.slice(0, symbol.length - 7)}-USD`;
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            channels: [{ name: 'ticker', product_ids: [coinbaseId] }],
          })
        );
      }
    }
  };
  ws.onmessage = function (response) {
    const data = JSON.parse(response.data);
    if (data.product_id == null) {
      return;
    }
    const symbol = `${data.product_id.slice(
      0,
      data.product_id.length - 4
    )}-CRYPTO`;
    if (assetMap.get(symbol) == null) {
      return;
    }
    asset = assetMap.get(symbol);

    asset.price = parseFloat(data.price);
    asset.change =
      ((asset.price - parseFloat(data.open_24h)) / parseFloat(data.open_24h)) *
      100;

    updateRow(symbol);
    updateTotalValue();
  };
  ws.onclose = function () {
    setTimeout(function () {
      loadWebSocket();
    }, 5000);
  };
}

async function addAsset() {
  const symbol = $('#symbolInput').val();
  const source = $('#typeInput').val();
  if (symbol == '' || source == null) {
    displayMessage('INVALID INPUT', false);
    return;
  }
  if (
    (assetMap.has(symbol) && source == 'cnbc') ||
    (assetMap.has(symbol + '-CRYPTO') && source == 'coinbase')
  ) {
    displayMessage('DUPLICATE SYMBOL ENTERED', false);
    return;
  }

  let name, type, precision;
  if (source == 'coinbase') {
    const productData = await fetch(
      `https://api.pro.coinbase.com/products/${symbol}-USD/`
    )
      .then(response => response.json())
      .catch(() => {});
    if (productData.message == 'NotFound') {
      displayMessage('SYMBOL NOT FOUND', false);
      return;
    } else {
      displayMessage('SYMBOL ADDED', true);
    }
    type = 'crypto';
    precision = Math.max(
      productData.quote_increment.match(/\.(\d*)$/)[1].length,
      2
    );

    const cryptoList = await fetch('https://api.pro.coinbase.com/currencies')
      .then(response => response.json())
      .catch(() => displayMessage('NO CONNECTION', false));
    for (const crypto of cryptoList) {
      if (crypto.id == symbol) {
        name = crypto.name;
        break;
      }
    }

    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [{ name: 'ticker', product_ids: [`${symbol}-USD`] }],
      })
    );
  } else {
    const data = await fetch(
      'https://quote.cnbc.com/quote-html-webservice/quote.htm?output=json' +
        `&symbols=${symbol}`
    )
      .then(response => response.json())
      .then(data => data.QuickQuoteResult.QuickQuote)
      .catch(() => displayMessage('NO CONNECTION', false));
    if (data.code == '1') {
      displayMessage('SYMBOL NOT FOUND', false);
      return;
    } else {
      displayMessage('SYMBOL ADDED', true);
    }
    name = data.name;
    type =
      data.assetType == 'STOCK' || data.assetType == 'INDEX'
        ? 'stock'
        : 'mutualFund';
    precision = 2;
  }

  const asset = new Asset(
    type == 'crypto' ? `${symbol}-CRYPTO` : symbol,
    name,
    type,
    0,
    precision
  );
  assetList.push(asset);
  updateAssetStorage();
  assetMap.set(asset.symbol, asset);
  $('#symbolInput').val('');
  $('#typeInput').prop('selectedIndex', 0);

  updateMode();
}

function removeAsset() {
  const symbol = $('#editFormHeader').html();
  $(getJQueryId(symbol, '')).remove();
  $('#editForm').addClass('hidden');

  if (assetMap.get(symbol).isCrypto()) {
    const cbId = `${symbol.slice(0, symbol.length - 7)}-USD`;
    ws.send(
      JSON.stringify({
        type: 'unsubscribe',
        channels: [{ name: 'ticker', product_ids: [cbId] }],
      })
    );
  }

  assetMap.delete(symbol);
  assetList.splice(getAssetIndex(symbol), 1);
  updateAssetStorage();

  updateMode();
}

function moveAssetUp() {
  const symbol = $('#editFormHeader').html();
  const assetIndex = getAssetIndex(symbol);
  if (assetIndex > 0) {
    const priorSymbol = assetList[assetIndex - 1].symbol;
    $(getJQueryId(symbol, '')).insertBefore(getJQueryId(priorSymbol, ''));
    swap(assetList, assetIndex, assetIndex - 1);
    updateAssetStorage();
  }
}

function moveAssetDown() {
  const symbol = $('#editFormHeader').html();
  const assetIndex = getAssetIndex(symbol);
  if (assetIndex < assetList.length - 1) {
    const nextSymbol = assetList[assetIndex + 1].symbol;
    $(getJQueryId(nextSymbol, '')).insertBefore(getJQueryId(symbol, ''));
    swap(assetList, assetIndex, assetIndex + 1);
    updateAssetStorage();
  }
}

function changeCash() {
  const newCash = $('#cashInput').val();
  if (/^(\d*\.?\d+|\d{1,3}(,\d{3})*(\.\d+)?)$/.test(newCash)) {
    cash = round(parseFloat(newCash.replace(/,/g, '')), 2);
    localStorage.setItem('cash', cash);

    $('#cashInput').val('');
    $('#cashInput').attr(
      'placeholder',
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cash)
    );
    displayMessage('CASH UPDATED', true);
  } else {
    displayMessage('INVALID AMOUNT', false);
  }
  updateTotalValue();
}

function changeAmount() {
  const symbol = $('#editFormHeader').html();
  let amount = $('#amountInput').val();
  if (/^(\d*\.?\d+|\d{1,3}(,\d{3})*(\.\d+)?)$/.test(amount)) {
    amount = parseFloat(amount.replace(/,/g, ''));
    assetMap.get(symbol).amount = amount;
    assetList[getAssetIndex(symbol)].amount = amount;
    updateAssetStorage();
  }
  $('#amountInput').val('');
  $('#editForm').addClass('hidden');
  updateRow(symbol);
  updateTotalValue();
}

async function updateCNBCPrices() {
  const symbolList = [];
  for (const [symbol, asset] of assetMap) {
    if (!asset.checkUpdateValid() || asset.isCrypto()) {
      continue;
    }
    symbolList.push(symbol);
  }
  if (symbolList.length == 0) {
    return;
  }
  const symbols = symbolList.join('|');
  await fetch(
    'https://quote.cnbc.com/quote-html-webservice/quote.htm?output=json' +
      `&requestMethod=fast&symbols=${symbols}`
  )
    .then(response => response.json())
    .then(data => {
      data = data.FastQuoteResult.FastQuote;
      if (symbolList.length == 1) {
        asset = assetMap.get(data.symbol);
        asset.price = round(parseFloat(data.last), asset.precision);
        asset.change = round(parseFloat(data.change_pct), asset.precision);
      } else {
        for (quote of data) {
          asset = assetMap.get(quote.symbol);
          asset.price = round(parseFloat(quote.last), asset.precision);
          asset.change = round(parseFloat(quote.change_pct), asset.precision);
        }
      }
      for (const symbol of symbolList) {
        updateRow(symbol);
      }

      if (delay != 1000) {
        delay = 1000;
        for (const [_, asset] of assetList) {
          asset.firstUpdate = false;
        }
      }
    })
    .catch(() => {
      displayMessage('NO CONNECTION', false);
      delay = 5000;
    });
  updateTotalValue();
}

function updateTotalValue() {
  let totalValue = 0;
  for (const [_, asset] of assetMap) {
    if (asset.price == null) {
      continue;
    }
    totalValue += asset.getValue();
  }

  $('#totalValue').html(
    new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(totalValue + parseFloat(cash))
  );
}

function updateMode() {
  if (!$('#modeCheckbox').is(':checked')) {
    $('#tableFooter').addClass('invisible');
    $('#watchlistTable .valueCell').hide();
    $('#watchlistTable .changeCell > *').css({ 'margin-right': '0.3em' });
    $('#watchlistTable :is(.priceCell, .changeCell, .valueCell)').removeClass(
      'portfolio'
    );
    $('#cashDiv').addClass('invisible');
    localStorage.setItem('mode', 'false');
  } else {
    $('#tableFooter').removeClass('invisible');
    $('#watchlistTable .valueCell').show();
    $('#watchlistTable .changeCell > *').css({ 'margin-right': '0' });
    $('#watchlistTable :is(.priceCell, .changeCell, .valueCell)').addClass(
      'portfolio'
    );
    $('#cashDiv').removeClass('invisible');
    localStorage.setItem('mode', 'true');
  }

  if (assetMap.size == 0) {
    $('#tableFooter').addClass('invisible');
    $('#topSection > div').show();
    $('#topSection').addClass('visible').removeClass('invisible');
    $('#watchlistTable').hide();
  } else {
    $('#watchlistTable').show();
  }
}

function updateAssetStorage() {
  localStorage.setItem('assetList', JSON.stringify(assetList));
}

function updateRow(symbol) {
  const asset = assetMap.get(symbol);

  if (!asset.firstUpdate) {
    asset.firstUpdate = true;
  }

  $(getJQueryId(asset.symbol, '-price')).html(
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: asset.precision,
      maximumFractionDigits: asset.precision,
    }).format(asset.price)
  );

  const changeData = $(getJQueryId(asset.symbol, '-change'));
  if (asset.change < 0) {
    changeData.removeClass(['positive', 'neutral']).addClass('negative');
  } else if (asset.change > 0) {
    changeData.removeClass(['negative', 'neutral']).addClass('positive');
  } else {
    changeData.removeClass(['positive', 'negative']).addClass('neutral');
  }
  changeData.html(
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'always',
    }).format(asset.change)
  );

  $(getJQueryId(asset.symbol, '-value')).html(
    asset.getValue() > 0
      ? new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 0,
        }).format(asset.getValue())
      : ''
  );
}

function displayMessage(message, success) {
  if (success) {
    $('#message').html(message).removeClass('failure').addClass('success');
  } else {
    $('#message').html(message).removeClass('success').addClass('failure');
  }
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(function () {
    if ($('#message').html() == message) {
      $('#message').html('&nbsp;');
    }
  }, 3000);
}

function getJQueryId(symbol, addend) {
  return `#${symbol}${addend}`.replace(/\./g, '\\.');
}

function getAssetIndex(symbol) {
  for (let i = 0; i < assetList.length; i++) {
    if (assetList[i].symbol == symbol) {
      return i;
    }
  }
  return -1;
}

function round(x, n) {
  return Math.round(x * Math.pow(10, n)) / Math.pow(10, n);
}

function swap(array, idx1, idx2) {
  const temp = array[idx1];
  array[idx1] = array[idx2];
  array[idx2] = temp;
}

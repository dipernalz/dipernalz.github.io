var assetList, assetMap, cash, ws, delay, messageTimeout;

$(document).ready(async function () {
  assetList = [];
  assetMap = new Map();
  const assetStorage = localStorage.getItem('assetList');
  if (assetStorage != null) {
    for (const obj of JSON.parse(assetStorage)) {
      const asset = Asset.fromObject(obj);
      assetList.push(asset);
      assetMap.set(asset.symbol, asset);
    }
  } else {
    updateAssetStorage();
  }

  const modeStorage = localStorage.getItem('mode');
  if (modeStorage != null) {
    $('#modeCheckbox').prop('checked', modeStorage === 'true');
  } else {
    localStorage.setItem('mode', 'false');
  }
  updateMode();

  const cashStorage = localStorage.getItem('cash');
  if (cashStorage != null) {
    cash = parseFloat(cashStorage);
  } else {
    cash = 0;
    localStorage.setItem('cash', cash);
  }

  $('#cashInput').attr(
    'placeholder',
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cash)
  );
  $('#cashInput').blur(function () {
    $('#cashInput').attr(
      'placeholder',
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cash)
    );
  });
  $('#closeButton').click(function () {
    $('#editForm').addClass('hidden');
  });

  if ($('#topSection').is(':hover')) {
    $('#topSection > div').show();
    $('#topSection').addClass('visible').removeClass('invisible');
  }
  $('#topSection').hover(
    function () {
      $('#topSection > div').show();
      $('#topSection').addClass('visible').removeClass('invisible');
    },
    function () {
      if (assetMap.size > 0) {
        $('#topSection > div').hide();
        $('#topSection').addClass('invisible').removeClass('visible');
      }
    }
  );
  $('#typeInput').mouseleave(function (e) {
    e.stopPropagation();
  });

  loadWebSocket();

  delay = 1000;
  while (true) {
    await updateCNBCPrices();
    await new Promise(resolve => setTimeout(resolve, delay));
  }
});

window.onclick = function (e) {
  if (e.target.id == 'editForm') {
    $('#editForm').addClass('hidden');
  }
};

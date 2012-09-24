(function() {
  
  var DEBUG = false;

  var word;
  
  var multiDictOnClick = function(info, tab) {
    if (DEBUG) {
      console.log('multiDictClick: word=' + word);
    }
    chrome.tabs.sendMessage(tab.id, {action: 'translate', word: word, tabId: tab.id});
  };

  chrome.contextMenus.create({
    title: 'Translation and pronunciation',
    contexts: ['all'],
    onclick: multiDictOnClick
  });

  chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
      var action = request.action;
      switch (request.action) {
        case 'right_click':
          if (request.hasOwnProperty('word')) {
            // Save the word in the closure. This is why we need to handle this message.
            word = request.word;
            console.log('user clicked on word: ' + word);
          }
          break;
        case 'close':
          chrome.tabs.sendMessage(request.tabId, {action: 'close'});
          break;
        default:
          console.log('Unexpected message received by background page', request);
      }
    }
  );

})();


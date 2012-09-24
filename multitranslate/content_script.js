/*global console, chrome, jQuery */

(function () {
  "use strict";

  if (window !== window.top) {
    return;
  }

  var DEBUG = false,
      ESC_KEY = 27,
      POPUP_X_OFFSET = 10,
      POPUP_Y_OFFSET = 5,
      POPUP_ID = 'multiTranslatePopupWindow',
      POPUP_ID_SELECTOR = '#' + POPUP_ID,
      FRAME_SIZE_DELTA_X = 2,
      FRAME_SIZE_DELTA_Y = 20,
      RESIZE_CURSOR_DISTANCE = 5,
      CHROME_WORKAROUND_SPAN_HEIGHT = 4,

      /** One or more punctuation characters */
      PUNCTUATION_RE = /[\.,-\/#!$%\^&\*;:{}=\-_`~()\"]+/,

      LEADING_PUNCTUATION_RE = new RegExp('^' + PUNCTUATION_RE.source),
      TRAILING_PUNCTUATION_RE = new RegExp(PUNCTUATION_RE.source + '$'),
      WHITESPACE_RE = /^(?:\s|\n)$/,

      $ = jQuery,

      body = document.getElementsByTagName('body')[0],
      windowJQ = $(window),

      clickEvent,
      popupDiv,
      popupJQ,
      resizeIntervalId;

  /**
   * Get current selection on the page. This is not necessarily
   */
  var getSelection = function() {
    var txt = '';
    if (window.getSelection) {
      txt = window.getSelection();
    } else if (document.getSelection) {
      txt = document.getSelection();
    } else if (document.selection) {
      txt = document.selection.createRange().text;
    }
    return txt;
  };

  var trimPunctuation = function(s) {
    return s.replace(LEADING_PUNCTUATION_RE, '').replace(TRAILING_PUNCTUATION_RE, '');
  };

  /**
   * Find the clicked word and send a message to the background page to save the word.
   */
  var findClickedWordSendMessage = function(event) {
    var selection = window.getSelection(),
        range = selection.getRangeAt(0),
        node = selection.anchorNode,
        rangeStr,
        clickedWord;

    clickEvent = event;

    if (DEBUG) {
      console.log("mouse click at x=" + event.pageX + ", y=" + event.pageY, event);
    }

    // Expand the low end of the range until we hit a whitespace character or the beginning of the
    // text node.
    // Warning: this is currently a quadratic algorithm.
    while (range.startOffset > 0) {
      rangeStr = range.toString();
      if (WHITESPACE_RE.test(rangeStr.substr(0, 1))) {
        range.setStart(node, range.startOffset + 1);
        break;
      } else {
        range.setStart(node, range.startOffset - 1);
      }
    }

    // Expand the high end of the range until we hit the end of the node or a whitespace character.
    // Warning: this is currently a quadratic algorithm.
    rangeStr = range.toString();
    while (!WHITESPACE_RE.test(rangeStr.substr(rangeStr.length - 1, 1)) &&
           range.endOffset < node.length) {
      range.setEnd(node, range.endOffset + 1);
      rangeStr = range.toString();
    }

    clickedWord = range.toString().trim();
    clickedWord = trimPunctuation(clickedWord);

    if (DEBUG) {
      console.log("findClickedWordSendMessage", clickedWord);
    }
    chrome.extension.sendMessage({action: 'right_click', word: clickedWord});

  };

  /**
   * Make an iframe inside the given element and loading the given URL from this extension.
   *
   * @param parent element to insert the iframe into
   * @param relUrl URL relative to the extension
   */
  var makeFrame = function(parent, relUrl) {
    var ifrm = document.createElement("iframe"),
        url = chrome.extension.getURL(relUrl);
    if (DEBUG) {
      console.log("Trying to load in iframe: " + url);
    }
    ifrm.setAttribute("src", url);
    parent.appendChild(ifrm);
    return ifrm;
  };

  var basicReset = function(element) {
    var style = element.style;

    style.margin = 0;
    style.padding = 0;
    style.border = 0;
    style['font-size'] = '100%';
    style.font = 'inherit';
    style['vertical-align'] = 'baseline';
  };

  var removePopup = function() {
    popupJQ.remove();
    popupDiv = null;
    popupJQ = null;
    windowJQ.unbind('mouseup');
    windowJQ.unbind('keyup');
    window.clearInterval(resizeIntervalId);
  };

  /**
   * Helper event handler to change cursor to se-resize (south-east) in the bottom-right corner.
   * Inspired by:
   * http://stackoverflow.com/questions/1259779/how-can-i-implement-resizing-in-javascript
   * @param e event
   */
  var changeCursorOnResize = function(e) {
    var r = popupDiv,
        bottom = r.clientHeight - e.offsetY,
        right = r.clientWidth - e.offsetX;

    // If the pointer is further than 5 pixels from an edge, do not display
    // any resize cursor.
    if (bottom > RESIZE_CURSOR_DISTANCE || right > RESIZE_CURSOR_DISTANCE) {
      r.style.cursor = 'default';
    } else {
      r.style.cursor = 'se-resize';
    }
  };

  var translateWord = function(request) {

    var word = request.word,
        w = 400,
        h = 300;

    console.log('content script received message: ' + JSON.stringify(request));

    if (DEBUG) {
      console.log("translate event for: " + word);
    }

    popupDiv = document.createElement('div');
    basicReset(popupDiv);
    popupDiv.id = POPUP_ID;
    popupDiv.style.position = 'absolute';
    popupDiv.style.left = (clickEvent.pageX + POPUP_X_OFFSET) + "px";
    popupDiv.style.top = (clickEvent.pageY + POPUP_Y_OFFSET) + "px";
    popupDiv.style.width = w + "px";
    popupDiv.style.height = h + "px";
    popupDiv.style.opacity = "100%";
    popupDiv.style['border-style'] = 'solid';
    popupDiv.style['border-color'] = 'black';
    popupDiv.style['border-width'] = '1px';
    popupDiv.style['background-color'] = 'white';
    popupDiv.style.overflow = 'hidden';
    popupDiv.style['z-index'] = '2147483647';
    popupDiv.style.resize = "both";
    popupDiv.style['min-height'] = "100px";
    popupDiv.style['min-width'] = "100px";
    popupDiv.style.padding = '3px';

    // Workaround for a Chrome bug with horizontal lines on iframe scrolling: http://bit.ly/Qv8sCR
    var workaroundSpan = document.createElement('span');
    workaroundSpan.style.display = 'block';
    workaroundSpan.style.height = CHROME_WORKAROUND_SPAN_HEIGHT + 'px';
    workaroundSpan.innerHTML = '&nbsp;';
    popupDiv.appendChild(workaroundSpan);

    var popupFrame = makeFrame(popupDiv, "show_word.html?" +
        encodeURIComponent(JSON.stringify({
          word: word,
          tabId: request.tabId
        })));
    basicReset(popupFrame);
    popupFrame.style.overflow = 'scroll';

    body.appendChild(popupDiv);
    $(popupDiv).mouseup(function(event) {
      event.stopPropagation();
    });

    popupJQ = $(POPUP_ID_SELECTOR);

    var setFrameWidthHeight = function(event) {
      popupFrame.style.width = (popupJQ.width() - FRAME_SIZE_DELTA_X) + 'px';
      popupFrame.style.height = (popupJQ.height() - FRAME_SIZE_DELTA_Y) + 'px';
    };
    resizeIntervalId = window.setInterval(setFrameWidthHeight, 200);
    setFrameWidthHeight();

    if (DEBUG) {
      console.log("Positioned popup at x=" + popupDiv.style.left + ", y=" + popupDiv.style.top);
    }

    var removePopupOnESC = function(e) {
      if (popupDiv && e.which === ESC_KEY) {
        removePopup();
        e.preventDefault();
      }
    };

    windowJQ.keyup(removePopupOnESC);
    $(popupFrame).keyup(removePopupOnESC);

    windowJQ.mouseup(function(event) {
      if (popupDiv &&
          event.target.id !== POPUP_ID &&
          $(event.target).parents(POPUP_ID_SELECTOR).size() === 0) {
        // This click is outside the popup, close the popup. If clicked inside the popup
        // we don't do anything.
        removePopup();
      }
    });

    popupDiv.onmousemove = changeCursorOnResize;
  };

  // Listen to messages coming from other parts of the extension.
  chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
      switch (request.action) {
        case 'translate':
          translateWord(request);
          break;
        case 'close':
          removePopup();
          break;
        default:
          console.log('Unknown action received', request.action)
      };
    }
  );

  document.body.addEventListener('contextmenu', findClickedWordSendMessage, true);

})();

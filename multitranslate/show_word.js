/**
 * This is shown in an iframe popup served by the extension. We load a mash-up of multiple
 * online dictionaries. This whole page is .
 */
window.onload = function() {

  'use strict';

  var ESC_KEY = 27;
  var DEBUG = false;
  var CACHE_DEBUG = true;
  var CLASSES_TO_SKIP = ['direction', 'notebooks-loading', 'notebooks-written', 'notebooks',
      'other-dictionaries'];
  var URL_CACHE_PREFIX = 'zip_cache2_';
  var PAGE_FILE_NAME = 'page.html';
  var USE_BASE64 = false;

  var mainDiv = document.createElement('div');
  var requestArgs = JSON.parse(decodeURIComponent(document.location.search.substr(1)));
  var word = requestArgs.word;

  var tfdPronunciationURL;
  var encodedWord = encodeURIComponent(word);
  var popupDivJQ;
  var $ = window.jQuery;
  var body;
  var console = window.console;
  var head = $("head");

  mainDiv.innerHTML = '<div class="popupLoading">Loading...</div>';
  body = document.getElementsByTagName('body')[0];
  body.appendChild(mainDiv);

  var yandexSlovariBaseURL = 'http://slovari.yandex.ru/';
  var tfdURL = 'http://www.thefreedictionary.com/';
  var tfdPlayRE = /^\s*play_[a-z0-9]+\("([a-zA-Z0-9]+)"\)\s*$/;

  var compressString = function(rawString) {
    if (rawString === null) {
      return 'null';
    }
    var zip = new JSZip();
    var f = zip.file(PAGE_FILE_NAME, rawString, {binary: false});
    var compressedData = zip.generate({compression: 'DEFLATE', base64: USE_BASE64});
    if (CACHE_DEBUG) {
      var rawLen = rawString.length;
      var compLen = compressedData.length;
      console.log('Compressed ' + rawLen + ' to ' + compLen + ', ratio: ' + (rawLen / compLen));
    }
    return compressedData;
  };

  var decompressString = function(compressedData) {
    if (!compressedData || compressedData === 'null') {
      return null;
    }
    var unzip = new JSZip(compressedData, {base64: USE_BASE64});
    var f = unzip.file(PAGE_FILE_NAME);
    return f.asText();
  };

  /**
   * Fix the source URL of the given element that might refer to the extension page. We are
   * replacing it with the original URL on its source site.
   * @param element an HTML element to fix the URL of
   * @param attr attribute holding the source URL
   */
  var fixSrc = function(element, attr) {
    var oldURL = element[attr];

    var url = element[attr];
    url = url.replace(/^chrome-extension:\/\/(?:[a-z]+)\//, yandexSlovariBaseURL);
    url = url.replace(/^chrome-extension:\/\//, "http://");
    if (url !== oldURL) {
      element[attr] = url;
      if (DEBUG) {
        console.log('Replaced ' + oldURL + ' with ' + url);
      }
    } else {
      if (DEBUG) {
        console.log('Could not fix URL: ' + oldURL);
      }
    }
  };

  var parseHTML = function(s) {
    var d = document.createElement('html');
    d.innerHTML = s;
    return $(d);
  };

  var fixYandexSlovariA = function(index, element) {
    fixSrc(element, 'href', yandexSlovariBaseURL);
    element.target = '_blank';
  };

  var fixYandexSlovariImg = function(index, element) {
    fixSrc(element, 'src');
  };

  var fixYandexSlovariLink = function(index, element) {
    fixSrc(element, 'href');
    if (element.rel === 'stylesheet') {
      head.append(element);
    }
  };

  var numAJAX = 0;

  var cachedAJAX = function(url, done, postProcess) {
    var cacheKey = URL_CACHE_PREFIX + url,
        cachedValue = decompressString(window.localStorage[cacheKey]);

    if (cachedValue) {
      if (DEBUG) {
        console.log('Found cached content: ' + url);
      }
      // The URL is already cached, just pass the cached value.
      done(cachedValue);
    } else {
      if (DEBUG) {
        console.log('Content not cached: ' + url);
      }
      numAJAX++;
      $.ajax({url:url}).done(
          function (responseText) {
            // Cache the value in the background.
            if (postProcess) {
              // Do post-processing before caching. This significantly reduces the amount of
              // data to cache.
              responseText = postProcess(responseText);
            }
            window.setTimeout(function() {
              try {
                window.localStorage.removeItem(cacheKey);
                window.localStorage.setItem(cacheKey, compressString(responseText));
              } catch (e) {
                // TODO: evict least recently used elements instead of clearing the entire cache.
                console.log('Error when caching, local storage length: ' +
                    JSON.stringify(window.localStorage).length + ', clearing', e);
                window.localStorage.clear();
              }
            }, 0);
            done(responseText);
          }
      );
    }
  };

  /**
   * Perform the given action when all outstanding AJAX requests have completed. If no AJAX requests
   * are happening (e.g. all requests were satisfied from cache), the action is performed
   * immediately.
   *
   *  @param action a function
   */
  var cachedAJAXStop = function(action) {
    if (numAJAX > 0) {
      $(document).ajaxStop(action);
    } else {
      action();
    }
  };

  cachedAJAX(yandexSlovariBaseURL + encodedWord,
    function(responseText) {
      // unsafe
      var transPage = parseHTML(responseText);

      var translation = transPage.find(".l-page__center");
      var i;

      for (i = 0; i < CLASSES_TO_SKIP.length; ++i) {
        translation.find('div.b-translation__' + CLASSES_TO_SKIP[i]).empty();
      }

      translation.find('img.b-icon_type_audio-big').remove();

      $.each(translation.find('a'), fixYandexSlovariA);
      $.each(translation.find('img'), fixYandexSlovariImg);

      if (DEBUG) {
        console.log("scanning head links");
      }

      $.each(transPage.find('link'), fixYandexSlovariLink);

      mainDiv.innerHTML = translation.html();
      popupDivJQ = $(mainDiv);
    }
  );

  cachedAJAX(tfdURL + encodedWord,
    function(urlPart) {
      if (urlPart) {
        tfdPronunciationURL = 'http://img.tfd.com/hm/mp3/' + urlPart + '.mp3';
      } else {
        tfdPronunciationURL = null;
      }
    },
    function(responseText) {
      var tfdPage = parseHTML(responseText);
      var urlFragment = null;
      $.each(tfdPage.find('script'), function(i, el) {
        var match = tfdPlayRE.exec(el.innerHTML);
        if (match) {
          urlFragment = match[1];;
        }
      });
      return urlFragment;
    }
  );

  cachedAJAXStop(function() {
    if (tfdPronunciationURL) {
      if (DEBUG) {
        console.log('all ajax requests complete');
      }
      var playW = '100%';
      var playH = '20px';
      var playDim = 'height="' + playH + '" width="' + playW + '"';
      var playDivJQ = $(
        '<audio controls="controls" class="multiTransPronunciation" ' + playDim + '>' +
        '<source type="audio/mp3" src="' + tfdPronunciationURL + '"/>' +
        '</audio>'
      );
      if (popupDivJQ) {
        var insertAudioBefore = popupDivJQ.find("div.b-translation__article");
        if (DEBUG && insertAudioBefore.length === 0) {
          console.log("warning: could not find where to insert audio");
        }
        playDivJQ.insertBefore(insertAudioBefore);
      } else {
        console.log('translation did not load, not inserting audio');
      }
    }
  });


  $(body).keyup(function(e) {
    if (e.which === ESC_KEY) {
      // Send a message to the content script to close the popup.
      e.preventDefault();
      chrome.extension.sendMessage(null, {action: 'close', tabId: requestArgs.tabId});
    }
  });

};

// popup.js - Phase 5: Remote Control (Background Playback)

console.log("Popup loaded. Phase 5: Remote Control.");

// --- DOM Elements ---
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnReset = document.getElementById('btnReset');
const btnTestVoice = document.getElementById('btnTestVoice');
const linkReportIssue = document.getElementById('linkReportIssue');

const textContent = document.getElementById('textArea');
const progressBar = document.getElementById('progressBar');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');

const settingsPanel = document.getElementById('settingsPanel');
const voiceSelect = document.getElementById('voiceSelect');
const rateRange = document.getElementById('rateRange');
const rateValue = document.getElementById('rateValue');
const pitchRange = document.getElementById('pitchRange');
const pitchValue = document.getElementById('pitchValue');
const volumeRange = document.getElementById('volumeRange');
const volumeValue = document.getElementById('volumeValue');

// --- Global State (UI Only) ---
let uiState = {
  sentences: [], // We keep a local copy for rendering
  currentIndex: 0,
  isPlaying: false,
  settings: {
    voiceName: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0
  }
};

let voices = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  // Load Settings
  await loadSettings();

  // Populate Voices
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }
  populateVoices();

  // Load Content
  try {
    const rawText = await getPageContent();
    initializeUI(rawText);

    // Auto-detect language and select voice if not set
    if (!uiState.settings.voiceName && rawText && rawText.length > 20) {
      chrome.runtime.sendMessage({ type: 'CMD_DETECT_LANG', text: rawText.slice(0, 500) }, (response) => {
        if (response && response.lang) {
          console.log("Detected Language:", response.lang);
          const langCode = response.lang.split('-')[0].toLowerCase();

          // Find matching voice
          const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(langCode));
          if (matchingVoice) {
            uiState.settings.voiceName = matchingVoice.name;
            uiState.settings.voiceName = matchingVoice.name;
            voiceSelect.value = matchingVoice.name;
            // Ephemeral update: plays with this voice but doesn't overwrite user default
            updateSettings({ voiceName: matchingVoice.name });
          }
        }
      });
    }

    // Check if background player is already running
    chrome.runtime.sendMessage({ type: 'CMD_GET_STATE' });
  } catch (err) {
    console.error("Failed to get content:", err);
    textContent.innerHTML = `<p class="error">Could not read page: ${err.message}</p>`;
  }
});

// --- Communication with Offscreen (The "Remote") ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_UI') {
    uiState.isPlaying = msg.state.isPlaying;
    uiState.currentIndex = msg.state.currentIndex;
    togglePlayIcon(uiState.isPlaying);
    highlightCurrentSentence();
    updateProgress();
  }
});

function sendCommand(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload });
}

// Helper to update local state and notify player, but NOT save to storage (ephemeral)
function updateSettings(newSettings) {
  uiState.settings = { ...uiState.settings, ...newSettings };
  sendCommand('CMD_UPDATE_SETTINGS', { settings: uiState.settings });
}

// --- Player UI Logic ---

function initializeUI(text) {
  if (!text || text.trim().length === 0) {
    textContent.innerHTML = '<p class="placeholder-text">No readable text found.</p>';
    return;
  }

  // Parse sentences locally for rendering - Updated to respect newlines as boundaries
  // This prevents merged lines in novels/translated content
  const lines = text.split(/\n+/);
  uiState.sentences = [];
  uiState.lineBreaks = []; // Track indices where line breaks should appear

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) return;

    // Mark where this new line starts in the sentence array
    if (uiState.sentences.length > 0) {
      uiState.lineBreaks.push(uiState.sentences.length);
    }

    // Split each line into sentences but keep them within the same paragraph context
    const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
    const lineSentences = trimmedLine.match(sentenceRegex) || [trimmedLine];
    uiState.sentences.push(...lineSentences.map(s => s.trim()).filter(s => s.length > 0));
  });

  renderSentences();
  updateProgress();
}

function renderSentences() {
  textContent.innerHTML = "";
  uiState.sentences.forEach((sentence, index) => {
    // Add visual line break before this sentence if it starts a new paragraph
    if (uiState.lineBreaks && uiState.lineBreaks.includes(index)) {
      textContent.appendChild(document.createElement('br'));
      textContent.appendChild(document.createElement('br'));
    }

    const span = document.createElement('span');
    span.textContent = sentence + " ";
    span.id = `sentence-${index}`;
    span.dataset.index = index;
    span.onclick = () => {
      // Always INIT on click to ensure player has correct text/index context
      sendCommand('CMD_INIT', { text: uiState.sentences.join(' '), index: index });
    };
    span.style.cursor = "pointer";
    textContent.appendChild(span);
  });
}

function highlightCurrentSentence() {
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
  const currentId = `sentence-${uiState.currentIndex}`;
  const el = document.getElementById(currentId);
  if (el) {
    el.classList.add('highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function updateProgress() {
  if (uiState.sentences.length === 0) return;
  const progress = ((uiState.currentIndex) / uiState.sentences.length) * 100;
  progressBar.style.width = `${progress}%`;
}

function togglePlayIcon(isPlaying) {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}


// --- Content Extraction (Same as before) ---
async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return "Cannot read this internal browser page.";
  }

  const viewerUrlPrefix = chrome.runtime.getURL('pdf-viewer.html');

  // 1. Check if we are already on our custom PDF viewer page
  if (tab.url.startsWith(viewerUrlPrefix)) {
    console.log("Already on PDF viewer, requesting texts...");
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PDF_TEXTS' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve("Failed to communicate with PDF viewer: " + chrome.runtime.lastError.message);
        } else if (response && response.error) {
          resolve("PDF Viewer Error: " + response.error);
        } else if (response) {
          resolve(response.join('\n\n'));
        } else {
          resolve("No text found in PDF.");
        }
      });
    });
  }

  // 2. Check if current page is likely a PDF (cannot inject into Chrome's PDF viewer)
  if (tab.url.toLowerCase().endsWith('.pdf') || (tab.url.includes('.pdf?') || tab.url.includes('.pdf#'))) {
    const viewerUrl = viewerUrlPrefix + '?url=' + encodeURIComponent(tab.url);
    // Use chrome.tabs.create because top-level navigation in the same tab to extension pages
    // can be blocked by Chrome in Manifest V3 (ERR_BLOCKED_BY_CLIENT).
    chrome.tabs.create({ url: viewerUrl });
    return 'Redirecting to PDF Viewer in a new tab...';
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractContentFromPage
  });
  if (!results || !results[0] || !results[0].result) throw new Error("No content found.");
  return results[0].result;
}

function extractContentFromPage() {
  // --- Read-Aloud Inspired Text Extraction ---
  // Based on https://github.com/ken107/read-aloud/blob/master/js/content/html-doc.js

  // 1. Check for user selection first
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0) return selection;

  // 2. Define tags to ignore (noise elements)
  const ignoreTags = 'select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-read-aloud, [aria-hidden="true"], .ads, .ad-container, .sidebar, .social-share, [class*="ad-"], [id*="ad-"], .btn, .term-edit-btn, .ai-model-badge';

  // 3. Helper functions
  function getInnerText(elem) {
    const text = elem.innerText;
    return text ? text.trim() : '';
  }

  function isVisible(elem) {
    if (!elem.offsetWidth && !elem.offsetHeight) return false;
    const style = window.getComputedStyle(elem);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function shouldSkip(elem) {
    if (!isVisible(elem)) return true;
    try {
      if (elem.matches(ignoreTags)) return true;
    } catch (e) { /* invalid selector */ }
    const style = window.getComputedStyle(elem);
    if (style.float === 'right' || style.position === 'fixed') return true;
    return false;
  }

  function someChildNodes(elem, test) {
    let child = elem.firstChild;
    while (child) {
      if (test(child)) return true;
      child = child.nextSibling;
    }
    return false;
  }

  function isTextNode(node) {
    return node.nodeType === 3 && node.nodeValue.trim().length >= 3;
  }

  function isParagraph(node, threshold) {
    return node.nodeType === 1 &&
      node.tagName === 'P' &&
      isVisible(node) &&
      getInnerText(node).length >= threshold;
  }

  function hasTextNodes(elem, threshold) {
    return someChildNodes(elem, isTextNode) && getInnerText(elem).length >= threshold;
  }

  function hasParagraphs(elem, threshold) {
    return someChildNodes(elem, node => isParagraph(node, threshold));
  }

  // 4. Find text blocks via recursive DOM walk
  function findTextBlocks(threshold) {
    const skipTagsSelector = 'h1, h2, h3, h4, h5, h6, p, a[href], ' + ignoreTags;
    const textBlocks = [];

    function containsTextBlocks(elem) {
      const children = Array.from(elem.children).filter(c => {
        try { return !c.matches(skipTagsSelector); } catch (e) { return true; }
      });
      return children.some(c => hasTextNodes(c, threshold)) ||
        children.some(c => hasParagraphs(c, threshold)) ||
        children.some(containsTextBlocks);
    }

    function addBlock(elem, isMulti) {
      if (isMulti) elem.dataset.readAloudMultiBlock = 'true';
      textBlocks.push(elem);
    }

    function walk(elem) {
      if (!elem || !elem.tagName) return;

      try {
        // Handle iframes
        if (elem.tagName === 'IFRAME' || elem.tagName === 'FRAME') {
          try { walk(elem.contentDocument.body); } catch (e) { /* cross-origin */ }
          return;
        }

        // Handle definition lists
        if (elem.tagName === 'DL') {
          addBlock(elem);
          return;
        }

        // Handle ordered/unordered lists
        if (elem.tagName === 'OL' || elem.tagName === 'UL') {
          const items = Array.from(elem.children);
          if (items.some(li => hasTextNodes(li, threshold))) {
            addBlock(elem);
          } else if (items.some(li => hasParagraphs(li, threshold))) {
            addBlock(elem, true);
          } else if (items.some(containsTextBlocks)) {
            addBlock(elem, true);
          }
          return;
        }

        // Handle tables
        if (elem.tagName === 'TBODY') {
          const rows = Array.from(elem.children);
          if (rows.length > 3 || (rows[0] && rows[0].children.length > 3)) {
            if (rows.some(containsTextBlocks)) addBlock(elem, true);
          } else {
            rows.forEach(walk);
          }
          return;
        }

        // General case
        if (hasTextNodes(elem, threshold)) {
          addBlock(elem);
        } else if (hasParagraphs(elem, threshold)) {
          addBlock(elem, true);
        } else {
          // Check shadow DOM too
          const children = elem.shadowRoot
            ? [...elem.children, ...elem.shadowRoot.children]
            : elem.children;
          Array.from(children).forEach(child => {
            try {
              if (!child.matches(skipTagsSelector)) walk(child);
            } catch (e) {
              walk(child);
            }
          });
        }
      } catch (e) {
        console.warn('Walk error:', e);
      }
    }

    walk(document.body);

    // Filter to only visible blocks with positive offset
    return textBlocks.filter(elem => {
      if (!isVisible(elem)) return false;
      try {
        const rect = elem.getBoundingClientRect();
        return rect.left >= 0;
      } catch (e) {
        return true;
      }
    });
  }

  // 5. Calculate Gaussian distribution for statistical outlier detection
  function getGaussian(texts, start = 0, end = texts.length) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += texts[i].length;
    const mean = sum / (end - start);
    let variance = 0;
    for (let i = start; i < end; i++) {
      variance += (texts[i].length - mean) * (texts[i].length - mean);
    }
    return { mean, stdev: Math.sqrt(variance / (end - start || 1)) };
  }

  // 6. Determine if an element should not be read (noise within content)
  function dontRead(elem) {
    const style = window.getComputedStyle(elem);
    const float = style.float;
    const position = style.position;
    try {
      return elem.matches(ignoreTags) ||
        elem.tagName === 'SUP' ||
        float === 'right' ||
        position === 'fixed';
    } catch (e) {
      return false;
    }
  }

  // 7. Add numbering to list items that don't already have it
  function addNumbering(listElem) {
    const children = Array.from(listElem.children);
    if (children.length === 0) return;

    const firstText = children[0].innerText ? children[0].innerText.trim() : '';
    // Don't add numbering if items already have numbering
    if (firstText && /^[(]?(\d|[a-zA-Z][).])/.test(firstText)) return;

    children.forEach((child, index) => {
      const span = document.createElement('span');
      span.className = 'read-aloud-numbering';
      span.textContent = (index + 1) + '. ';
      child.insertBefore(span, child.firstChild);
    });
  }

  // 8. Extract text from a block - with hiding of noise elements
  function getTexts(elem) {
    // Find and hide elements that shouldn't be read
    const toHide = [];
    elem.querySelectorAll('*').forEach(child => {
      if (isVisible(child) && dontRead(child)) {
        child.style.display = 'none';
        toHide.push(child);
      }
    });

    // Add numbering to lists
    elem.querySelectorAll('ol, ul').forEach(addNumbering);
    if (elem.tagName === 'OL' || elem.tagName === 'UL') {
      addNumbering(elem);
    }

    // Extract text based on block type
    let texts;
    if (elem.dataset && elem.dataset.readAloudMultiBlock) {
      texts = Array.from(elem.children)
        .filter(isVisible)
        .map(child => getText(child));
    } else {
      texts = getText(elem).split(/(?:\s*\r?\n\s*){2,}/);
    }

    // Clean up: remove numbering spans and unhide elements
    elem.querySelectorAll('.read-aloud-numbering').forEach(span => span.remove());
    toHide.forEach(el => { el.style.display = ''; });

    return texts;
  }

  // 9. Extract text from a single element  
  function getText(elem) {
    return addMissingPunctuation(elem.innerText).trim();
  }

  // 10. Add missing punctuation to lines ending with word characters
  function addMissingPunctuation(text) {
    return text.replace(/(\w)(\s*?\r?\n)/g, '$1.$2');
  }

  // 11. Parse the document
  function parse() {
    // Find blocks with high threshold first (50 chars)
    let textBlocks = findTextBlocks(50);
    let countChars = textBlocks.reduce((sum, elem) => sum + getInnerText(elem).length, 0);
    console.log('[SpeakAloud] Found', textBlocks.length, 'blocks,', countChars, 'chars (threshold=50)');

    // If not enough content, try lower threshold
    if (countChars < 1000) {
      textBlocks = findTextBlocks(3);
      const texts = textBlocks.map(getInnerText);
      console.log('[SpeakAloud] Using lower threshold, found', textBlocks.length, 'blocks,', texts.join('').length, 'chars');

      // Trim header and footer using Gaussian outlier detection
      if (texts.length > 6) {
        let head = null, tail = null;

        // Find header cutoff
        for (let i = 3; i < texts.length && head === null; i++) {
          const dist = getGaussian(texts, 0, i);
          if (texts[i].length > dist.mean + 2 * dist.stdev) head = i;
        }

        // Find footer cutoff
        for (let i = texts.length - 4; i >= 0 && tail === null; i--) {
          const dist = getGaussian(texts, i + 1, texts.length);
          if (texts[i].length > dist.mean + 2 * dist.stdev) tail = i + 1;
        }

        if (head !== null || tail !== null) {
          textBlocks = textBlocks.slice(head || 0, tail || textBlocks.length);
          console.log('[SpeakAloud] Trimmed header/footer:', head, tail);
        }
      }
    }

    // Find headings for each block
    const toRead = [];
    for (let i = 0; i < textBlocks.length; i++) {
      toRead.push(...findHeadingsFor(textBlocks[i], textBlocks[i - 1]));
      toRead.push(textBlocks[i]);
    }

    // Extract texts from blocks using getTexts (with hiding/numbering)
    return toRead.flatMap(getTexts).filter(t => t && t.length > 0);
  }

  // 12. Find headings that precede a content block
  function findHeadingsFor(block, prevBlock) {
    const result = [];

    function getHeadingLevel(elem) {
      if (!elem || !elem.tagName) return 100;
      const match = /^H(\d)$/i.exec(elem.tagName);
      return match ? Number(match[1]) : 100;
    }

    function previousNode(node, skipChildren) {
      if (!node || node.tagName === 'BODY') return null;
      if (node.nodeType === 1 && !skipChildren && node.lastChild) return node.lastChild;
      if (node.previousSibling) return node.previousSibling;
      if (node.parentNode) return previousNode(node.parentNode, true);
      return null;
    }

    // Get level of first heading/paragraph inside the block
    const firstInner = block.querySelector('h1, h2, h3, h4, h5, h6, p');
    let currentLevel = getHeadingLevel(firstInner);
    let node = previousNode(block, true);

    while (node && node !== prevBlock) {
      try {
        const shouldIgnore = node.matches && node.matches(ignoreTags);
        if (!shouldIgnore && node.nodeType === 1 && isVisible(node)) {
          const level = getHeadingLevel(node);
          if (level < currentLevel) {
            result.push(node);
            currentLevel = level;
          }
        }
        node = previousNode(node, shouldIgnore);
      } catch (e) {
        node = previousNode(node, true);
      }
    }

    return result.reverse();
  }

  // 10. Run the extraction
  try {
    const texts = parse();
    if (texts.length === 0) {
      // Fallback: use document body innerText
      return addMissingPunctuation(document.body.innerText)
        .split(/(?:\s*\r?\n\s*){2,}/)
        .filter(t => t.trim().length >= 3)
        .join('\n\n');
    }
    return texts.join('\n\n');
  } catch (err) {
    console.error('[SpeakAloud] Extraction error:', err);
    // Ultimate fallback
    return document.body.innerText;
  }
}

// --- Settings Logic ---
async function loadSettings() {
  const data = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume']);
  uiState.settings.voiceName = data.voiceName || null;
  uiState.settings.rate = parseFloat(data.rate) || 1.0;
  uiState.settings.pitch = parseFloat(data.pitch) || 1.0;
  uiState.settings.volume = parseFloat(data.volume) || 1.0;

  rateRange.value = uiState.settings.rate;
  rateValue.textContent = uiState.settings.rate + "x";
  pitchRange.value = uiState.settings.pitch;
  pitchValue.textContent = uiState.settings.pitch;
  if (volumeRange) {
    volumeRange.value = uiState.settings.volume;
    volumeValue.textContent = uiState.settings.volume;
  }
}

function saveAndBroadcastSettings() {
  chrome.storage.sync.set(uiState.settings);
  sendCommand('CMD_UPDATE_SETTINGS', { settings: uiState.settings });
}

function populateVoices() {
  voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = '';
  let selectedIndex = 0;
  let googleEnglishIndex = -1;
  let defaultIndex = -1;

  voices.forEach((voice, i) => {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = voice.name;

    if (voice.name.includes("Google") && (voice.lang === 'en-US' || voice.lang === 'en_US')) googleEnglishIndex = i;
    if (voice.default) defaultIndex = i;
    if (voice.name === uiState.settings.voiceName) selectedIndex = i;

    voiceSelect.appendChild(option);
  });

  if (!uiState.settings.voiceName) {
    if (googleEnglishIndex !== -1) selectedIndex = googleEnglishIndex;
    else if (defaultIndex !== -1) selectedIndex = defaultIndex;
  }

  voiceSelect.selectedIndex = selectedIndex;
  if (voices.length > 0) uiState.settings.voiceName = voices[selectedIndex].name;
}

// --- Event Listeners ---

btnPlay.onclick = () => {
  if (uiState.isPlaying) {
    sendCommand('CMD_PAUSE');
  } else {
    // Init with current text to be safe
    sendCommand('CMD_INIT', {
      text: uiState.sentences.join(' '), // Reconstruct full text 
      index: uiState.currentIndex
    });
  }
};

btnStop.onclick = () => sendCommand('CMD_STOP');
btnNext.onclick = () => sendCommand('CMD_NEXT');
btnPrev.onclick = () => sendCommand('CMD_PREV');

// Settings UI
btnSettings.onclick = () => settingsPanel.classList.remove('hidden');
btnCloseSettings.onclick = () => settingsPanel.classList.add('hidden');

rateRange.oninput = (e) => {
  uiState.settings.rate = parseFloat(e.target.value);
  rateValue.textContent = uiState.settings.rate + "x";
  saveAndBroadcastSettings();
};

pitchRange.oninput = (e) => {
  uiState.settings.pitch = parseFloat(e.target.value);
  pitchValue.textContent = uiState.settings.pitch;
  saveAndBroadcastSettings();
};

if (volumeRange) {
  volumeRange.oninput = (e) => {
    uiState.settings.volume = parseFloat(e.target.value);
    volumeValue.textContent = uiState.settings.volume;
    saveAndBroadcastSettings();
  };
}

voiceSelect.onchange = (e) => {
  uiState.settings.voiceName = e.target.value;
  saveAndBroadcastSettings();
};

if (btnTestVoice) {
  btnTestVoice.onclick = () => {
    sendCommand('CMD_TEST');
  };
}

btnReset.onclick = () => {
  uiState.settings = { voiceName: null, rate: 1.0, pitch: 1.0, volume: 1.0 };
  rateRange.value = 1.0; rateValue.textContent = "1.0x";
  pitchRange.value = 1.0; pitchValue.textContent = "1.0";
  if (volumeRange) { volumeRange.value = 1.0; volumeValue.textContent = "1.0"; }

  populateVoices();
  saveAndBroadcastSettings();
};

if (linkReportIssue) {
  linkReportIssue.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: linkReportIssue.href });
  };
}

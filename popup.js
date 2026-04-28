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
  isPaused: false,
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
  // Retry once after a short delay because Chrome can be slow
  setTimeout(populateVoices, 100);

  // Load Content
  try {
    const rawText = await getPageContent();
    initializeUI(rawText);

    // Auto-detect language and select voice if not set
    if (!uiState.settings.voiceName && rawText && rawText.trim().length > 20) {
      chrome.runtime.sendMessage({ type: 'CMD_ENSURE_OFFSCREEN' }, () => {
        chrome.runtime.sendMessage({ type: 'CMD_DETECT_LANG', text: rawText.slice(0, 500) }, (response) => {
          if (response && response.lang) {
            console.log("Detected Language:", response.lang);
            const langCode = response.lang.split('-')[0].toLowerCase();
  
            // Find matching voice
            const matchingVoice = voices.find(v => v.lang.toLowerCase().startsWith(langCode));
            if (matchingVoice && uiState.settings.voiceName !== matchingVoice.name) {
              uiState.settings.voiceName = matchingVoice.name;
              voiceSelect.value = matchingVoice.name;
              updateSettings({ voiceName: matchingVoice.name });
            }
          }
        });
      });
    }

    // Check if background player is already running (sync UI)
    chrome.runtime.sendMessage({ type: 'CMD_ENSURE_OFFSCREEN' }, () => {
      chrome.runtime.sendMessage({ type: 'CMD_GET_STATE' }, (response) => {
        if (response && response.type === 'UPDATE_UI') {
          handleUpdateUI(response.state);
        }
      });
    });
  } catch (err) {
    console.error("Failed to get content:", err);
    textContent.innerHTML = `<p class="error">Could not read page: ${err.message}</p>`;
  }
});

// --- Communication with Offscreen (The "Remote") ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_UI') {
    handleUpdateUI(msg.state);
  }
});

function handleUpdateUI(state) {
  uiState.isPlaying = state.isPlaying;
  uiState.isPaused = state.isPaused;
  uiState.currentIndex = state.currentIndex;
  togglePlayIcon(uiState.isPlaying);
  highlightCurrentSentence();
  updateProgress();
}

function sendCommand(type, payload = {}) {
  chrome.runtime.sendMessage({ type: 'CMD_ENSURE_OFFSCREEN' }, () => {
    chrome.runtime.sendMessage({ type, ...payload });
  });
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
      sendCommand('CMD_INIT', { 
        sentences: uiState.sentences, 
        index: index 
      });
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
  const progress = ((uiState.currentIndex + 1) / uiState.sentences.length) * 100;
  progressBar.style.width = `${Math.min(progress, 100)}%`;
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

  const results = await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Failed to communicate with content script: " + chrome.runtime.lastError.message));
      } else if (response && response.error) {
        reject(new Error("Extraction Error: " + response.error));
      } else if (response && response.result) {
        resolve(response.result);
      } else {
        reject(new Error("No content found or extraction failed."));
      }
    });
  });
  return results;
}

// extractContentFromPage function removed and moved to content.js

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

let saveTimeout = null;
function saveAndBroadcastSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    chrome.storage.sync.set(uiState.settings);
    sendCommand('CMD_UPDATE_SETTINGS', { settings: uiState.settings });
  }, 50); // 50ms debounce
}

function populateVoices() {
  voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;

  voiceSelect.innerHTML = '';
  let selectedIndex = -1;

  voices.forEach((voice, i) => {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = voice.name;
    voiceSelect.appendChild(option);

    if (voice.name === uiState.settings.voiceName) {
      selectedIndex = i;
    }
  });

  // Fallback selection logic
  if (selectedIndex === -1) {
    const googleEnglish = voices.findIndex(v => v.name.includes("Google") && v.lang.startsWith('en'));
    const anyEnglish = voices.findIndex(v => v.lang.startsWith('en'));
    const defaultVoice = voices.findIndex(v => v.default);
    
    let fallbackIndex = 0;
    if (googleEnglish !== -1) fallbackIndex = googleEnglish;
    else if (anyEnglish !== -1) fallbackIndex = anyEnglish;
    else if (defaultVoice !== -1) fallbackIndex = defaultVoice;

    voiceSelect.selectedIndex = fallbackIndex;
    if (!uiState.settings.voiceName) {
      uiState.settings.voiceName = voices[fallbackIndex].name;
    }
  } else {
    voiceSelect.selectedIndex = selectedIndex;
  }
}

// --- Event Listeners ---

btnPlay.onclick = () => {
  if (uiState.isPlaying) {
    sendCommand('CMD_PAUSE');
  } else if (uiState.isPaused) {
    sendCommand('CMD_TOGGLE_PLAY');
  } else {
    // Init with current text and settings to be safe
    sendCommand('CMD_INIT', {
      sentences: uiState.sentences, 
      index: uiState.currentIndex,
      settings: uiState.settings
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
    chrome.tabs.create({ url: linkReportIssue.getAttribute('href') });
  };
}

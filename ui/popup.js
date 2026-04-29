// popup.js - UI Controller for Speak Aloud Extension

// --- DOM Elements ---
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnReset = document.getElementById('btnReset');
const btnTestVoice = document.getElementById('btnTestVoice');

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

// --- Global State ---
let uiState = {
  sentences: [],
  lineBreaks: [],
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
  await loadSettings();
  setupVoiceSelection();

  // 1. Check if background already has a state (playback in progress)
  chrome.runtime.sendMessage({ type: 'CMD_GET_STATE' }, async (response) => {
    if (response && response.state && response.state.sentences.length > 0) {
      handleUpdateUI(response.state);
    } else {
      // 2. Fresh start: extract content
      try {
        const text = await getPageContent();
        if (text) {
          sendCommand('CMD_INIT', { text, index: 0, settings: uiState.settings });
        } else {
          textContent.innerHTML = '<p class="placeholder-text">No readable text found.</p>';
        }
      } catch (err) {
        console.error("Extraction failed:", err);
        textContent.innerHTML = `<p class="error">Error: ${err.message}</p>`;
      }
    }
  });
});

// --- Communication ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'UPDATE_UI') {
    console.log("Popup: Received UPDATE_UI, sentences:", msg.state.sentences.length);
    handleUpdateUI(msg.state);
  }
  return true; // Keep port open for other listeners like offscreen
});

function sendCommand(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload });
}

function handleUpdateUI(state) {
  const needsRerender = uiState.sentences.length !== state.sentences.length;
  
  uiState = { ...uiState, ...state };

  if (needsRerender) {
    renderSentences();
  }

  togglePlayIcon(uiState.isPlaying && !uiState.isPaused);
  highlightCurrentSentence();
  updateProgress();
}

// --- UI Rendering ---

function renderSentences() {
  textContent.innerHTML = "";
  uiState.sentences.forEach((sentence, index) => {
    if (uiState.lineBreaks && uiState.lineBreaks.includes(index)) {
      textContent.appendChild(document.createElement('br'));
      textContent.appendChild(document.createElement('br'));
    }

    const span = document.createElement('span');
    span.textContent = sentence + " ";
    span.id = `sentence-${index}`;
    span.onclick = () => sendCommand('CMD_JUMP', { index });
    textContent.appendChild(span);
  });
}

function highlightCurrentSentence() {
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
  const el = document.getElementById(`sentence-${uiState.currentIndex}`);
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

function togglePlayIcon(active) {
  if (active) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

// --- Content Extraction ---

async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return null;

  // Handle PDF redirection
  if (tab.url.toLowerCase().endsWith('.pdf')) {
    const viewerUrl = chrome.runtime.getURL('ui/pdf-viewer.html') + '?url=' + encodeURIComponent(tab.url);
    chrome.tabs.create({ url: viewerUrl });
    return null;
  }

  const trySendMessage = () => {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (response) => {
        if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
        else resolve(response);
      });
    });
  };

  let response = await trySendMessage();
  
  if (response && response.error && (response.error.includes("Could not establish connection") || response.error.includes("Receiving end does not exist"))) {
    console.log("Popup: Content script not found, injecting...");
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/Readability.js', 'scripts/content.js']
      });
      await new Promise(r => setTimeout(r, 200)); // Wait for script init
      response = await trySendMessage();
    } catch (e) {
      console.error("Popup: Injection failed", e);
    }
  }

  if (response && response.result) {
    return response.result;
  } else {
    throw new Error(response ? response.error || "Extraction failed." : "Extraction failed.");
  }
}

// --- Settings & Voices ---

async function loadSettings() {
  const data = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume']);
  uiState.settings = {
    voiceName: data.voiceName || null,
    rate: parseFloat(data.rate) || 1.0,
    pitch: parseFloat(data.pitch) || 1.0,
    volume: parseFloat(data.volume) || 1.0
  };

  rateRange.value = uiState.settings.rate;
  rateValue.textContent = uiState.settings.rate + "x";
  pitchRange.value = uiState.settings.pitch;
  pitchValue.textContent = uiState.settings.pitch;
  volumeRange.value = uiState.settings.volume;
  volumeValue.textContent = uiState.settings.volume;
}

function setupVoiceSelection() {
  const updateVoices = () => {
    voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      setTimeout(updateVoices, 200);
      return;
    }
    voiceSelect.innerHTML = '';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
    if (uiState.settings.voiceName) {
      voiceSelect.value = uiState.settings.voiceName;
    }
  };

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = updateVoices;
  }
  updateVoices();
}

function saveSettings() {
  chrome.storage.sync.set(uiState.settings);
  sendCommand('CMD_UPDATE_SETTINGS', { settings: uiState.settings });
}

// --- Event Listeners ---

btnPlay.onclick = () => {
  if (uiState.isPlaying && !uiState.isPaused) sendCommand('CMD_PAUSE');
  else sendCommand('CMD_PLAY');
};

btnStop.onclick = () => sendCommand('CMD_STOP');
btnNext.onclick = () => sendCommand('CMD_NEXT');
btnPrev.onclick = () => sendCommand('CMD_PREV');

btnSettings.onclick = () => settingsPanel.classList.remove('hidden');
btnCloseSettings.onclick = () => settingsPanel.classList.add('hidden');

rateRange.oninput = (e) => {
  uiState.settings.rate = parseFloat(e.target.value);
  rateValue.textContent = e.target.value + "x";
  saveSettings();
};

pitchRange.oninput = (e) => {
  uiState.settings.pitch = parseFloat(e.target.value);
  pitchValue.textContent = e.target.value;
  saveSettings();
};

volumeRange.oninput = (e) => {
  uiState.settings.volume = parseFloat(e.target.value);
  volumeValue.textContent = e.target.value;
  saveSettings();
};

voiceSelect.onchange = (e) => {
  uiState.settings.voiceName = e.target.value;
  saveSettings();
};

btnTestVoice.onclick = () => sendCommand('CMD_TEST');

btnReset.onclick = () => {
  uiState.settings = { voiceName: null, rate: 1.0, pitch: 1.0, volume: 1.0 };
  loadSettings(); // Reset UI values
  saveSettings();
};

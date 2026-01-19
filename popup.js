// popup.js - Phase 4: Full Features (Player + Settings)

console.log("Popup loaded. Phase 4: Full Features.");

// --- DOM Elements ---
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnReset = document.getElementById('btnReset');

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
// New Volume Elements
const volumeRange = document.getElementById('volumeRange');
const volumeValue = document.getElementById('volumeValue');

// --- Global State ---
let playerState = {
  isPlaying: false,
  isPaused: false,
  sentences: [],
  currentIndex: 0,
  utterance: null,
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
  window.speechSynthesis.cancel();

  // Load settings first
  await loadSettings();

  // Populate voices (wait for them to be ready)
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }
  populateVoices();

  // Load Content
  try {
    const rawText = await getPageContent();
    initializePlayer(rawText);
  } catch (err) {
    console.error("Failed to get content:", err);
    textContent.innerHTML = `<p class="error">Could not read page: ${err.message}</p>`;
  }
});

// --- Settings Logic ---

async function loadSettings() {
  const data = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume']);
  playerState.settings.voiceName = data.voiceName || null;
  playerState.settings.rate = parseFloat(data.rate) || 1.0;
  playerState.settings.pitch = parseFloat(data.pitch) || 1.0;
  playerState.settings.volume = parseFloat(data.volume) || 1.0;

  // Update UI
  rateRange.value = playerState.settings.rate;
  rateValue.textContent = playerState.settings.rate + "x";
  pitchRange.value = playerState.settings.pitch;
  pitchValue.textContent = playerState.settings.pitch;

  if (volumeRange && volumeValue) {
    volumeRange.value = playerState.settings.volume;
    volumeValue.textContent = playerState.settings.volume;
  }
}

function saveSettings() {
  const s = playerState.settings;
  chrome.storage.sync.set({
    voiceName: s.voiceName,
    rate: s.rate,
    pitch: s.pitch,
    volume: s.volume
  });
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

    // Prioritize Google English
    if (voice.name.includes("Google") && (voice.lang === 'en-US' || voice.lang === 'en_US')) {
      googleEnglishIndex = i;
    }
    if (voice.default) {
      defaultIndex = i;
    }

    if (voice.name === playerState.settings.voiceName) {
      selectedIndex = i;
    }

    voiceSelect.appendChild(option);
  });

  // Default Selection Logic
  if (!playerState.settings.voiceName) {
    if (googleEnglishIndex !== -1) {
      selectedIndex = googleEnglishIndex;
    } else if (defaultIndex !== -1) {
      selectedIndex = defaultIndex;
    }
  }

  voiceSelect.selectedIndex = selectedIndex;
  if (voices.length > 0) {
    playerState.settings.voiceName = voices[selectedIndex].name;
  }
}

// UI Event Listeners for Settings
btnSettings.onclick = () => settingsPanel.classList.remove('hidden');
btnCloseSettings.onclick = () => settingsPanel.classList.add('hidden');

rateRange.oninput = (e) => {
  const val = parseFloat(e.target.value);
  playerState.settings.rate = val;
  rateValue.textContent = val + "x";
  saveSettings();
};

pitchRange.oninput = (e) => {
  const val = parseFloat(e.target.value);
  playerState.settings.pitch = val;
  pitchValue.textContent = val;
  saveSettings();
};

if (volumeRange) {
  volumeRange.oninput = (e) => {
    const val = parseFloat(e.target.value);
    playerState.settings.volume = val;
    volumeValue.textContent = val;
    saveSettings();
  };
}

voiceSelect.onchange = (e) => {
  playerState.settings.voiceName = e.target.value;
  saveSettings();
};

btnReset.onclick = () => {
  playerState.settings.rate = 1.0;
  playerState.settings.pitch = 1.0;
  playerState.settings.volume = 1.0;
  playerState.settings.voiceName = null; // Reset to allow auto-finding

  rateRange.value = 1.0;
  rateValue.textContent = "1.0x";
  pitchRange.value = 1.0;
  pitchValue.textContent = "1.0";
  if (volumeRange) {
    volumeRange.value = 1.0;
    volumeValue.textContent = "1.0";
  }

  populateVoices();
  saveSettings();
};

// --- Text Extraction ---
async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return "Cannot read this internal browser page.";
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractContentFromPage
  });
  if (!results || !results[0] || !results[0].result) throw new Error("No content found.");
  return results[0].result;
}

function extractContentFromPage() {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0) return selection;

  const selectors = ['article', 'main', '[role="main"]', '.post-content', '#content'];
  let contentNode = null;
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && node.innerText.length > 200) {
      contentNode = node;
      break;
    }
  }
  if (!contentNode) contentNode = document.body;
  if (!contentNode) return "";

  const blockElements = contentNode.querySelectorAll('p, h1, h2, h3, h4, h5, li');
  if (blockElements.length > 0) {
    let textParts = [];
    blockElements.forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 20) textParts.push(text);
    });
    return textParts.join("\n\n");
  } else {
    return contentNode.innerText;
  }
}

// --- Player Logic ---

function initializePlayer(text) {
  if (!text || text.trim().length === 0) {
    textContent.innerHTML = '<p class="placeholder-text">No readable text found.</p>';
    return;
  }
  const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
  playerState.sentences = text.match(sentenceRegex) || [text];
  // Filter empty only, do not trim away structural newlines
  playerState.sentences = playerState.sentences.filter(s => s.trim().length > 0);
  renderSentences();
  updateProgress();
}

function renderSentences() {
  textContent.innerHTML = "";
  playerState.sentences.forEach((sentence, index) => {
    const span = document.createElement('span');
    span.textContent = sentence + " ";
    span.id = `sentence-${index}`;
    span.dataset.index = index;
    span.onclick = () => playFromIndex(index);
    span.style.cursor = "pointer";
    textContent.appendChild(span);
  });
}

function highlightCurrentSentence() {
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
  const currentId = `sentence-${playerState.currentIndex}`;
  const el = document.getElementById(currentId);
  if (el) {
    el.classList.add('highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function updateProgress() {
  if (playerState.sentences.length === 0) return;
  const progress = ((playerState.currentIndex) / playerState.sentences.length) * 100;
  progressBar.style.width = `${progress}%`;
}

function speakCurrentSentence() {
  if (playerState.currentIndex >= playerState.sentences.length) {
    stop();
    return;
  }

  window.speechSynthesis.cancel();

  const text = playerState.sentences[playerState.currentIndex];
  if (!text || text.trim().length === 0) {
    playerState.currentIndex++;
    speakCurrentSentence();
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);

  // Apply Settings
  utter.rate = playerState.settings.rate;
  utter.pitch = playerState.settings.pitch;
  utter.volume = playerState.settings.volume;

  if (playerState.settings.voiceName) {
    const v = voices.find(voice => voice.name === playerState.settings.voiceName);
    if (v) utter.voice = v;
  }

  utter.onstart = () => {
    highlightCurrentSentence();
    updateProgress();
  };

  utter.onend = () => {
    if (playerState.isPlaying && !playerState.isPaused) {
      playerState.currentIndex++;
      speakCurrentSentence();
    }
  };

  utter.onerror = (e) => {
    console.error("Speech Error:", e);
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      if (playerState.isPlaying) {
        playerState.currentIndex++;
        speakCurrentSentence();
      }
    }
  };

  playerState.utterance = utter;
  window.speechSynthesis.speak(utter);
}

// --- Controls ---

function playFromIndex(index) {
  window.speechSynthesis.cancel();
  playerState.currentIndex = index;
  play();
}

function play() {
  if (playerState.sentences.length === 0) return;
  playerState.isPlaying = true;
  playerState.isPaused = false;
  togglePlayIcon(true);
  speakCurrentSentence();
}

function pause() {
  playerState.isPlaying = false;
  playerState.isPaused = true;
  togglePlayIcon(false);
  window.speechSynthesis.cancel();
}

function stop() {
  playerState.isPlaying = false;
  playerState.isPaused = false;
  playerState.currentIndex = 0;
  togglePlayIcon(false);
  window.speechSynthesis.cancel();
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
  progressBar.style.width = '0%';
}

function next() {
  if (playerState.currentIndex < playerState.sentences.length - 1) {
    playerState.currentIndex++;
    if (playerState.isPlaying) {
      speakCurrentSentence();
    } else {
      highlightCurrentSentence();
      updateProgress();
    }
  }
}

function prev() {
  if (playerState.currentIndex > 0) {
    playerState.currentIndex--;
    if (playerState.isPlaying) {
      speakCurrentSentence();
    } else {
      highlightCurrentSentence();
      updateProgress();
    }
  }
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

// --- Event Listeners ---
btnPlay.onclick = () => {
  if (playerState.isPlaying) pause();
  else play();
};
btnStop.onclick = stop;
btnNext.onclick = next;
btnPrev.onclick = prev;

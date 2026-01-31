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
    // Click to Jump
    span.onclick = () => {
      // Init offscreen player if first time, or just Jump
      // Ideally we re-init if the text changed, but for now assumption is page static
      // We always send INIT on click if we want to be safe, but let's assume JUMP is enough if started.
      // Actually, if fresh popup, offscreen might not have this text.
      // Safer strategy: always INIT on Play/Jump from a fresh popup context?
      // Let's rely on INIT being called on Play First.
      // For jump, we better send INIT first then JUMP.
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

  // 1. Identify "Noise" elements to skip - Expanded for better ad filtering
  const noiseSelectors = [
    'nav', 'header', 'footer', 'aside', 'script', 'style', 'iframe', 'ins',
    'noscript', '.ads', '#ads', '.sidebar', '.menu', '.social-share',
    '.ad-container', '.ad-slot', '.sponsored', '.promo', '.banner-ad',
    '[class*="ad-"]', '[id*="ad-"]', '[class*="sponsored"]', '[class*="promo"]',
    '[id*="goog"]', '.google-ad', '.amazon-ad', '.outbrain', '.taboola',
    '[role="complementary"]', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
  ];

  // Specific "Safe" selectors that might trigger noise filters but are known content containers
  const safeSelectors = ['.txtnav', '#txtnav', '.article-content', '.txt_content'];

  const contentTags = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '#content', '#main', '.txtnav', '.txt_content'];
  let candidate = null;

  // Check common content containers first
  for (const selector of contentTags) {
    const node = document.querySelector(selector);
    if (node && node.innerText.trim().length > 400) {
      candidate = node;
      break;
    }
  }

  // 3. Fallback: Scoring algorithm (simplified Readability-like)
  if (!candidate) {
    let topScore = 0;
    const allDivs = document.querySelectorAll('div, section, article');

    allDivs.forEach(node => {
      // Skip noise unless it's a known safe selector
      const isSafe = safeSelectors.some(sel => node.matches(sel));
      if (!isSafe && noiseSelectors.some(sel => node.matches(sel) || node.closest(sel))) return;

      // Score based on text content length and paragraph density
      const text = node.innerText.trim();
      const paragraphs = node.querySelectorAll('p');
      let score = text.length / 10;
      score += paragraphs.length * 20;

      // Penalize link density (links usually mean navigation)
      const links = node.querySelectorAll('a');
      if (links.length > 0) {
        const linkTextLength = Array.from(links).reduce((acc, a) => acc + a.innerText.length, 0);
        const linkDensity = linkTextLength / (text.length || 1);
        if (linkDensity > 0.4) score *= 0.2;
      }

      if (score > topScore) {
        topScore = score;
        candidate = node;
      }
    });
  }

  if (!candidate) candidate = document.body;

  // 4. Extract text from the winning candidate, cleaning as we go
  // Handle case where content is raw text nodes + <br> instead of <p>
  const blockElements = candidate.querySelectorAll('p, h1, h2, h3, h4, h5, li');
  let extractedLines = [];

  // If there are many blocks, use them (high confidence in blocks)
  if (blockElements.length > 5) {
    blockElements.forEach(el => {
      // Check if visible and not in noise
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      // Secondary check: if it matches noise selectors itself
      if (noiseSelectors.some(sel => el.matches(sel) || el.closest(sel))) return;

      const text = el.innerText.trim();
      if (text.length >= 3) { // Refined threshold to skip tiny noise while keeping dialogue
        extractedLines.push(text);
      }
    });
  } else {
    // Fallback for raw text/BR sites: use innerText but filter child noise
    const clone = candidate.cloneNode(true);

    // Aggressive cleaning of the clone
    const allSelectors = [...noiseSelectors, '.tools', '.baocuo', '.contentadv', '.bottom-ad', '.site-info', '.mytitle', '.hint', '.author-info', '.post-time'];
    const noiseInClone = clone.querySelectorAll(allSelectors.join(','));
    noiseInClone.forEach(n => n.remove());

    // Also remove elements with likely ad-related strings in their class/ID
    const allInClone = clone.querySelectorAll('*');
    allInClone.forEach(el => {
      const cls = el.className;
      const id = el.id;
      if (typeof cls === 'string' && (cls.toLowerCase().includes('ad-') || cls.toLowerCase().includes('google'))) el.remove();
      else if (typeof id === 'string' && (id.toLowerCase().includes('ad-') || id.toLowerCase().includes('google'))) el.remove();
    });

    // Improved split to better handle translated/complex page structures
    // Use /[ \t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/ to catch unicode spaces like EM SPACE
    return clone.innerText.split(/\n\r?|\r/)
      .map(t => t.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ').trim())
      .filter(t => t.length >= 3) // Refined threshold
      .join('\n\n');
  }

  return extractedLines.join('\n\n');
} z

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

// popup.js - Phase 3: Advanced Player & Karaoke

console.log("Popup loaded. Phase 3: Advanced Player Active.");

// --- DOM Elements ---
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSettings = document.getElementById('btnSettings');
const textContent = document.getElementById('textArea');
const progressBar = document.getElementById('progressBar');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');

// --- Global State ---
let playerState = {
  isPlaying: false,
  isPaused: false,
  sentences: [],
  currentIndex: 0,
  utterance: null
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  // Clear any residual synthesis
  window.speechSynthesis.cancel();

  try {
    const rawText = await getPageContent();
    initializePlayer(rawText);
  } catch (err) {
    console.error("Failed to get content:", err);
    textContent.innerHTML = `<p class="error">Could not read page: ${err.message}</p>`;
  }
});

// --- Core Logic: Text Extraction (Phase 2) ---
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

// --- Player Logic (Phase 3) ---

function initializePlayer(text) {
  if (!text || text.trim().length === 0) {
    textContent.innerHTML = '<p class="placeholder-text">No readable text found.</p>';
    return;
  }

  // Split text into sentences using basic punctuation heuristics
  // We use lookbehind (?) to keep the punctuation
  // Simplest regex for Phase 3: Split by (.!?) followed by space or end of string
  const sentenceRegex = /[^.!?]+[.!?]+["']?|[^.!?]+$/g;
  playerState.sentences = text.match(sentenceRegex) || [text];

  // Clean up sentences
  playerState.sentences = playerState.sentences
    .map(s => s.trim())
    .filter(s => s.length > 0);

  renderSentences();
  updateProgress();
}

function renderSentences() {
  textContent.innerHTML = "";
  playerState.sentences.forEach((sentence, index) => {
    const span = document.createElement('span');
    span.textContent = sentence + " "; // Add space for readability
    span.id = `sentence-${index}`;
    span.dataset.index = index;

    // Add click-to-play functionality
    span.onclick = () => {
      playFromIndex(index);
    };
    span.style.cursor = "pointer";

    textContent.appendChild(span);
  });
}

function highlightCurrentSentence() {
  // Remove previous highlights
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

  window.speechSynthesis.cancel(); // Clear previous utterance

  const text = playerState.sentences[playerState.currentIndex];
  // Simple check to skip empty nonsense
  if (!text || text.trim().length === 0) {
    playerState.currentIndex++;
    speakCurrentSentence();
    return;
  }

  const utter = new SpeechSynthesisUtterance(text);

  // Basic settings (Phase 4 will add UI for this)
  utter.rate = 1.0;

  utter.onstart = () => {
    highlightCurrentSentence();
    updateProgress();
  };

  utter.onend = () => {
    // Check if we should proceed (only if still playing and not paused)
    // Note: onend can fire when we manually cancel() too, so we need to be careful.
    // If we are isPlaying=true, it means we finished naturally or skipped.
    // However, if we call cancel() in stop(), isPlaying becomes false.
    if (playerState.isPlaying && !playerState.isPaused) {
      playerState.currentIndex++;
      speakCurrentSentence();
    }
  };

  utter.onerror = (e) => {
    console.error("Speech Error:", e);
    // If interrupted, don't auto-advance. If actual error, auto-advance?
    // 'interrupted' happens on .cancel()
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
  // Stop current logic to reset state cleanly
  window.speechSynthesis.cancel();
  playerState.currentIndex = index;
  play();
}

function play() {
  if (playerState.sentences.length === 0) return;

  playerState.isPlaying = true;
  playerState.isPaused = false;
  togglePlayIcon(true);

  // If we were paused, resume. But wait, we are managing queue manually.
  // Using .resume() is flaky with detailed highlighting sync.
  // Better to restart the current sentence from scratch for better sync.
  speakCurrentSentence();
}

function pause() {
  playerState.isPlaying = false;
  playerState.isPaused = true;
  togglePlayIcon(false);
  window.speechSynthesis.cancel(); // Better than pause() for granular control
}

function stop() {
  playerState.isPlaying = false;
  playerState.isPaused = false;
  playerState.currentIndex = 0;
  togglePlayIcon(false);
  window.speechSynthesis.cancel();

  // Reset UI
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
if (btnPlay) {
  btnPlay.onclick = () => {
    if (playerState.isPlaying) pause();
    else play();
  };
}
if (btnStop) btnStop.onclick = stop;
if (btnNext) btnNext.onclick = next;
if (btnPrev) btnPrev.onclick = prev;
if (btnSettings) btnSettings.onclick = () => alert("Settings coming in Phase 4!");

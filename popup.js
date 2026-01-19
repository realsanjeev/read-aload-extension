let synth = window.speechSynthesis;
let voices = [];

// DOM Elements
const voiceSelect = document.querySelector('#voiceSelect');
const rateInput = document.querySelector('#rate');
const pitchInput = document.querySelector('#pitch');
const volumeInput = document.querySelector('#volume');
const playBtn = document.querySelector('#play');
const testBtn = document.querySelector('#testSettings');
const resetBtn = document.querySelector('#resetSettings');

const TEST_PHRASE = "Hello, I am reading for text tfile for testing the changed setting.";

const rateVal = document.querySelector('#rateVal');
const pitchVal = document.querySelector('#pitchVal');
const volumeVal = document.querySelector('#volumeVal');

// 1. SET DEFAULTS
const DEFAULTS = {
  rate: 1,
  pitch: 1,
  volume: 1,
  voiceName: "" // Will be determined by en-US logic if empty
};


// Function to update the "x" labels
function updateLabels() {
  const settings = [
    { input: rateInput, label: rateVal, def: DEFAULTS.rate },
    { input: pitchInput, label: pitchVal, def: DEFAULTS.pitch },
    { input: volumeInput, label: volumeVal, def: DEFAULTS.volume }
  ];

  settings.forEach(s => {
    const val = parseFloat(s.input.value).toFixed(1);
    s.label.textContent = `${val}x`;
    
    // Highlight if different from default
    if (val != s.def.toFixed(1)) {
      s.label.classList.add('changed');
    } else {
      s.label.classList.remove('changed');
    }
  });
}

// Update loadSettings to trigger label update
async function loadSettings() {
  const data = await chrome.storage.sync.get(['rate', 'pitch', 'volume', 'voiceName']);
  rateInput.value = data.rate || DEFAULTS.rate;
  pitchInput.value = data.pitch || DEFAULTS.pitch;
  volumeInput.value = data.volume || DEFAULTS.volume;
  updateLabels(); // Update labels after loading
  return data.voiceName || "";
}

// Add event listeners to update labels while sliding
[rateInput, pitchInput, volumeInput].forEach(el => {
  el.oninput = () => {
    updateLabels();
    saveSettings();
  };
});

// Update Reset Logic to clear labels
resetBtn.onclick = () => {
  rateInput.value = DEFAULTS.rate;
  pitchInput.value = DEFAULTS.pitch;
  volumeInput.value = DEFAULTS.volume;
  updateLabels();
  
  chrome.storage.sync.remove(['rate', 'pitch', 'volume', 'voiceName'], () => {
    populateVoiceList();
  });
};
// Function to update the "x" labels
function updateLabels() {
  const settings = [
    { input: rateInput, label: rateVal, def: DEFAULTS.rate },
    { input: pitchInput, label: pitchVal, def: DEFAULTS.pitch },
    { input: volumeInput, label: volumeVal, def: DEFAULTS.volume }
  ];

  settings.forEach(s => {
    const val = parseFloat(s.input.value).toFixed(1);
    s.label.textContent = `${val}x`;
    
    // Highlight if different from default
    if (val != s.def.toFixed(1)) {
      s.label.classList.add('changed');
    } else {
      s.label.classList.remove('changed');
    }
  });
}

// Update loadSettings to trigger label update
async function loadSettings() {
  const data = await chrome.storage.sync.get(['rate', 'pitch', 'volume', 'voiceName']);
  rateInput.value = data.rate || DEFAULTS.rate;
  pitchInput.value = data.pitch || DEFAULTS.pitch;
  volumeInput.value = data.volume || DEFAULTS.volume;
  updateLabels(); // Update labels after loading
  return data.voiceName || "";
}

// Add event listeners to update labels while sliding
[rateInput, pitchInput, volumeInput].forEach(el => {
  el.oninput = () => {
    updateLabels();
    saveSettings();
  };
});

// Update Reset Logic to clear labels
resetBtn.onclick = () => {
  rateInput.value = DEFAULTS.rate;
  pitchInput.value = DEFAULTS.pitch;
  volumeInput.value = DEFAULTS.volume;
  updateLabels();
  
  chrome.storage.sync.remove(['rate', 'pitch', 'volume', 'voiceName'], () => {
    populateVoiceList();
  });
};
// 3. SAVE SETTINGS TO STORAGE
function saveSettings() {
  chrome.storage.sync.set({
    rate: rateInput.value,
    pitch: pitchInput.value,
    volume: volumeInput.value,
    voiceName: voiceSelect.value
  });
}

// 4. POPULATE VOICES & SELECT SAVED/DEFAULT
async function populateVoiceList() {
  voices = synth.getVoices();
  const savedVoiceName = await loadSettings();
  
  voiceSelect.innerHTML = '';
  let autoSelectIndex = 0;

  voices.forEach((voice, i) => {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = voice.name; // Use name as unique ID
    
    // Priority 1: Previously saved voice
    if (voice.name === savedVoiceName) {
      autoSelectIndex = i;
    } 
    // Priority 2: en-US default (only if no saved voice matches)
    else if (!savedVoiceName && (voice.lang === 'en-US' || voice.lang === 'en_US')) {
       if (voice.default || autoSelectIndex === 0) autoSelectIndex = i;
    }

    voiceSelect.appendChild(option);
  });

  voiceSelect.selectedIndex = autoSelectIndex;
}

// Initialization
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = populateVoiceList;
}
populateVoiceList();

// Listen for any UI changes to save automatically
[rateInput, pitchInput, volumeInput, voiceSelect].forEach(el => {
  el.onchange = saveSettings;
});

// RESET LOGIC
resetBtn.onclick = () => {
  rateInput.value = DEFAULTS.rate;
  pitchInput.value = DEFAULTS.pitch;
  volumeInput.value = DEFAULTS.volume;
  
  // Re-run voice selection logic to find en-US default
  chrome.storage.sync.remove(['rate', 'pitch', 'volume', 'voiceName'], () => {
    populateVoiceList();
  });
};

// HELPER: Create Utterance with current UI values
function createUtterance(text) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.voice = voices.find(v => v.name === voiceSelect.value);
  utter.rate = rateInput.value;
  utter.pitch = pitchInput.value;
  utter.volume = volumeInput.value;
  return utter;
}

// Playback Controls
testBtn.onclick = () => {
  synth.cancel();
  synth.speak(createUtterance(TEST_PHRASE));
};

playBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  
  const text = results[0].result;
  if (!text) return alert("Please highlight text first!");

  synth.cancel();
  synth.speak(createUtterance(text));
};

document.querySelector('#pause').onclick = () => {
  if (synth.speaking) synth.paused ? synth.resume() : synth.pause();
};
document.querySelector('#stop').onclick = () => synth.cancel();

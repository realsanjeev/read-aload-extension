// popup.js - Phase 2: Intelligent Text Extraction

console.log("Popup loaded. Phase 2: Text Extraction Active.");

// --- DOM Elements ---
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnSettings = document.getElementById('btnSettings');
const textContent = document.getElementById('textArea');
// Placeholder icons (we'll toggle these in Phase 3 fully, but basic toggle here)
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');

// --- Global State ---
let currentText = "";

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const text = await getPageContent();
    loadTextIntoUI(text);
  } catch (err) {
    console.error("Failed to get content:", err);
    textContent.innerHTML = `<p class="error">Could not read page content: ${err.message}</p>`;
  }
});

// --- Core Logic: Text Extraction ---

/**
 * Injects a script into the active tab to scrape the best available text.
 */
async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Safety check for restricted pages (chrome:// etc)
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    return "Cannot read this internal browser page.";
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractContentFromPage
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error("No content found.");
  }

  return results[0].result;
}

/**
 * This function runs INSIDE the web page context (Content Script).
 * It attempts to find the "main" content of the page.
 */
function extractContentFromPage() {
  // 1. Check for user selection first
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0) {
    return selection;
  }

  // 2. Readability-style heuristics (Simplified)
  // Try to find <article>, <main>, or likely containers
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-body',
    '.content',
    '#content'
  ];

  let contentNode = null;

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    // Basic validation: ensure it has enough text
    if (node && node.innerText.length > 200) {
      contentNode = node;
      break;
    }
  }

  // 3. Fallback: Parse Body (smartly)
  if (!contentNode) {
    contentNode = document.body;
  }

  // 4. Transform contentNode into clean text
  // We want to capture paragraphs to maintain structure
  if (!contentNode) return "";

  // Helper to clean and extract text from a node
  // We select specific block elements to avoid menus/footer junk if we grabbed <body>
  const blockElements = contentNode.querySelectorAll('p, h1, h2, h3, h4, h5, li');

  // If we found specific blocks, use them. Otherwise, dump innerText.
  if (blockElements.length > 0) {
    let textParts = [];
    blockElements.forEach(el => {
      const text = el.innerText.trim();
      // Filter out short/empty garbage (like menu items or empty P tags)
      if (text.length > 20) {
        textParts.push(text);
      }
    });
    return textParts.join("\n\n");
  } else {
    return contentNode.innerText;
  }
}

// --- UI Logic ---

/**
 * Displays the extracted text in the popup interface.
 */
function loadTextIntoUI(text) {
  if (!text || text.trim().length === 0) {
    textContent.innerHTML = '<p class="placeholder-text">No readable text found on this page.</p>';
    return;
  }

  currentText = text;

  // Simple display for Phase 2. 
  // In Phase 3, we will split this into <span> sentences for Highlighting.
  // Converting newlines to <br> for better readability in the preview.
  textContent.innerText = text; // Securely set text first
  textContent.innerHTML = textContent.innerText.replace(/\n\n/g, '<br><br>');
}


// --- Placeholder Event Listeners (Phase 1/2) ---
if (btnPlay) {
  btnPlay.addEventListener('click', () => {
    // Toggle Icon
    // Real playback logic coming in Phase 3
    const isPlaying = iconPlay.classList.contains('hidden');
    if (!isPlaying) {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      console.log("Simulating Play: ", currentText.substring(0, 50) + "...");
    } else {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      console.log("Simulating Pause");
    }
  });
}

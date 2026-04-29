// content.js - Optimized Content Extraction for Read Aloud Extension

console.log("[ReadAloud] Content script loaded.");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'EXTRACT_CONTENT') {
        try {
            const content = extractContentFromPage();
            sendResponse({ result: content });
        } catch (err) {
            console.error("[ReadAloud] Extraction failed:", err);
            sendResponse({ error: err.message });
        }
    }
});

function extractContentFromPage() {
    // 1. Check for user selection first (highest priority)
    const selection = window.getSelection().toString().trim();
    if (selection.length > 0) return selection;

    // 2. Use Readability.js if available
    if (typeof Readability !== 'undefined') {
        try {
            // Readability modifies the DOM, so clone it first
            const documentClone = document.cloneNode(true);
            const reader = new Readability(documentClone);
            const article = reader.parse();
            
            if (article && article.content) {
                const div = document.createElement('div');
                div.innerHTML = article.content;
                // Use innerText to preserve paragraph breaks properly
                return div.innerText.trim();
            }
        } catch (e) {
            console.error("[ReadAloud] Readability parsing failed:", e);
        }
    }
    
    // 3. Fallback to basic innerText
    return document.body.innerText.trim();
}

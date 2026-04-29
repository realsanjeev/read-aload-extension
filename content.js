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

    // 2. Define configuration
    const ignoreTags = 'select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .footer, .no-read-aloud, [aria-hidden="true"], .ads, .ad-container, .sidebar, .social-share, [class*="ad-"], [id*="ad-"], .btn, .term-edit-btn, .ai-model-badge';

    // Set to track elements that require multi-block processing
    const multiBlockElems = new Set();

    // 3. Helper functions (Optimized)
    const isVisible = (elem) => {
        if (!elem.offsetWidth && !elem.offsetHeight) return false;
        const style = window.getComputedStyle(elem);
        return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const shouldSkip = (elem) => {
        if (!isVisible(elem)) return true;
        try { if (elem.matches(ignoreTags)) return true; } catch (e) {}
        const style = window.getComputedStyle(elem);
        return style.float === 'right' || style.position === 'fixed';
    };

    const getInnerText = (elem) => (elem.textContent || '').trim();

    const isTextNode = (node, threshold) => node.nodeType === 3 && node.nodeValue.trim().length >= threshold;

    const hasTextNodes = (elem, threshold) => {
        let child = elem.firstChild;
        while (child) {
            if (isTextNode(child, threshold)) return true;
            child = child.nextSibling;
        }
        return false;
    };

    const hasParagraphs = (elem, threshold) => {
        let child = elem.firstChild;
        while (child) {
            if (child.nodeType === 1 && child.tagName === 'P' && getInnerText(child).length >= threshold) return true;
            child = child.nextSibling;
        }
        return false;
    };

    // 4. Find text blocks via ITERATIVE DOM walk
    function findTextBlocks(threshold) {
        const textBlocks = [];
        const skipTagsSelector = 'h1, h2, h3, h4, h5, h6, p, a[href], ' + ignoreTags;
        
        // Iterative walk using a stack
        const stack = [document.body];
        
        while (stack.length > 0) {
            const elem = stack.pop();
            if (!elem || !elem.tagName || shouldSkip(elem)) continue;

            const tagName = elem.tagName;

            // Handle special tags that usually represent terminal blocks
            if (tagName === 'DL' || tagName === 'OL' || tagName === 'UL' || tagName === 'TBODY') {
                if (tagName === 'TBODY') {
                    // For tables, we might want to drill down if it's small, or treat as block if complex
                    const rows = Array.from(elem.children);
                    if (rows.length > 3 || (rows[0] && rows[0].children.length > 3)) {
                        textBlocks.push(elem);
                        multiBlockElems.add(elem);
                    } else {
                        for (let i = rows.length - 1; i >= 0; i--) stack.push(rows[i]);
                    }
                } else {
                    // Lists
                    const items = Array.from(elem.children);
                    const hasContent = items.some(li => hasTextNodes(li, threshold) || hasParagraphs(li, threshold));
                    if (hasContent) textBlocks.push(elem);
                    else {
                        // If list itself doesn't have clear text, maybe children do
                        for (let i = items.length - 1; i >= 0; i--) stack.push(items[i]);
                    }
                }
                continue;
            }

            // General case
            if (hasTextNodes(elem, threshold)) {
                textBlocks.push(elem);
            } else if (hasParagraphs(elem, threshold)) {
                textBlocks.push(elem);
                multiBlockElems.add(elem);
            } else {
                // Not a block itself, push children to stack (in reverse to maintain order)
                const children = elem.shadowRoot ? Array.from(elem.shadowRoot.children) : Array.from(elem.children);
                for (let i = children.length - 1; i >= 0; i--) {
                    const child = children[i];
                    try {
                        if (!child.matches(skipTagsSelector)) stack.push(child);
                    } catch (e) {
                        stack.push(child);
                    }
                }
                
                // Also check for iframes (if same-origin)
                if (tagName === 'IFRAME' || tagName === 'FRAME') {
                   try { 
                       const doc = elem.contentDocument;
                       if (doc && doc.readyState === 'complete' && doc.body) {
                           stack.push(doc.body);
                       }
                   } catch(e) {}
                }
            }
        }

        return textBlocks.filter(elem => {
            try {
                const rect = elem.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            } catch (e) { return true; }
        });
    }

    // 5. Gaussian distribution helpers
    function getGaussian(texts, start = 0, end = texts.length) {
        let sum = 0;
        for (let i = start; i < end; i++) sum += texts[i].length;
        const mean = sum / (end - start);
        let variance = 0;
        for (let i = start; i < end; i++) variance += Math.pow(texts[i].length - mean, 2);
        return { mean, stdev: Math.sqrt(variance / (end - start || 1)) };
    }

    // 6. Extraction logic
    function getTexts(elem) {
        // Create a clone to avoid modifying the live DOM
        const clone = elem.cloneNode(true);
        
        // Remove unwanted elements from the clone
        clone.querySelectorAll(ignoreTags + ', sup').forEach(el => el.remove());

        // Handle list numbering on the clone
        const addNumbering = (list) => {
            const children = Array.from(list.children);
            if (children.length === 0) return;
            const firstText = (children[0].innerText || '').trim();
            if (firstText && /^[(]?(\d|[a-zA-Z][).])/.test(firstText)) return;
            children.forEach((c, i) => {
                const s = document.createElement('span');
                s.textContent = (i + 1) + '. ';
                c.insertBefore(s, c.firstChild);
            });
        };

        clone.querySelectorAll('ol, ul').forEach(addNumbering);
        if (clone.tagName === 'OL' || clone.tagName === 'UL') addNumbering(clone);

        let result;
        if (multiBlockElems.has(elem)) {
            result = Array.from(clone.children).map(c => addMissingPunctuation(c.textContent || '').trim());
        } else {
            result = addMissingPunctuation(clone.textContent || '').trim().split(/(?:\s*\r?\n\s*){2,}/);
        }

        return result;
    }

    function addMissingPunctuation(text = '') {
        return text.replace(/([^\s.,;:!?])([\t ]*\r?\n)/g, '$1.$2');
    }

    // 7. Core parse loop
    function parse() {
        let textBlocks = findTextBlocks(50);
        let totalChars = textBlocks.reduce((s, e) => s + getInnerText(e).length, 0);

        if (totalChars < 1000) {
            const candidateBlocks = findTextBlocks(3);
            const texts = candidateBlocks.map(getInnerText);
            if (texts.length > 6) {
                let head = null, tail = null;
                for (let i = 3; i < texts.length && head === null; i++) {
                    const g = getGaussian(texts, 0, i);
                    if (texts[i].length > g.mean + 2 * g.stdev) head = i;
                }
                for (let i = texts.length - 4; i >= 0 && tail === null; i--) {
                    const g = getGaussian(texts, i + 1, texts.length);
                    if (texts[i].length > g.mean + 2 * g.stdev) tail = i + 1;
                }
                if (head !== null || tail !== null) {
                    textBlocks = candidateBlocks.slice(head || 0, tail || candidateBlocks.length);
                } else {
                    textBlocks = candidateBlocks;
                }
            } else {
                textBlocks = candidateBlocks;
            }
        }

        let results = textBlocks.flatMap(getTexts).filter(t => t && t.length > 0);
        
        // Fallback: If still nothing, try common article containers
        if (results.length === 0) {
            const fallbackSelector = 'article, main, [role="main"], .main, .content, .post, .article, #content, #main';
            const main = document.querySelector(fallbackSelector);
            if (main) {
                results = getTexts(main).filter(t => t && t.length > 0);
            }
        }

        return results;
    }

    // 8. Run
    try {
        const texts = parse();
        return texts.length > 0 ? texts.join('\n\n') : '';
    } catch (e) {
        return '';
    }
}

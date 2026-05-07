// utils.js — Shared utilities for popup, pdf-viewer, and offscreen

/**
 * Deterministic djb2-like hash of a string, returned as a base-36 string.
 * Used to build stable storage keys for per-URL resume positions.
 * @param {string} s
 * @returns {string}
 */
export function hashStr(s) {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

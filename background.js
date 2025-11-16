"use strict";

// Background script for Ez zoom extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "TAKE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                sendResponse(null);
            } else {
                sendResponse(dataUrl);
            }
        });
        return true; // Keep channel open for async response
    }
    
    if (request.message === "TOGGLE_JAVASCRIPT") {
        const { enable, primaryPattern } = request.details;
        chrome.contentSettings.javascript.set({
            primaryPattern: primaryPattern,
            setting: enable ? "allow" : "block"
        }, () => {
            sendResponse(!chrome.runtime.lastError);
        });
        return true;
    }
    
    if (request.message === "GET_FIXED_ELEMENT_SELECTORS") {
        // This would require Debugger API, which we're not using
        // Return empty array for now
        sendResponse([]);
        return true;
    }
    
    if (request.message === "OPEN_WELCOME") {
        chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
        sendResponse(true);
        return true;
    }
});


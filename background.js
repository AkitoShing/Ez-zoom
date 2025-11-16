"use strict";

// Background script for Ez zoom extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "GET_FIXED_ELEMENT_SELECTORS") {
        // This would require Debugger API, which we're not using
        // Return empty array for now
        sendResponse([]);
        return true;
    }
});


"use strict";
(() => {
    if (window.matchMedia("(any-hover: none)").matches) {
        document.body.textContent = "The extension requires a mouse (pointing device).";
        document.body.style.textAlign = "center";
        return;
    }
    
    const titleEl = document.querySelector("#title");
    const strengthValueEl = document.querySelector("#strength-value");
    const transitionValueEl = document.querySelector("#transition-value");
    
    titleEl.onclick = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
    };
    
    for (const inputEl of document.querySelectorAll("input"))
        inputEl.addEventListener("input", inputChanged);
    
    /* Storage */
    let storage = {
        activationKey: "ctrlKey",
        holdToZoom: true,
        alwaysFollowCursor: true,
        disableJavascript: false,
        strength: 0.5, // 0.5 maps to 0.2 via getStrength
        transition: 200,
    };
    
    chrome.storage.sync.get(null, (response) => {
        storage = Object.assign({}, storage, response);
        setInputValues();
    });
    
    chrome.storage.onChanged.addListener((changes) => {
        for (const key of Object.keys(changes))
            updateStorage(key, changes[key].newValue);
        setInputValues();
    });
    
    /* Functions */
    function setInputValues() {
        for (const inputEl of document.querySelectorAll("input")) {
            const key = inputEl.getAttribute("key");
            const { activationKey, strength, transition } = storage;
            const value = storage[key];
            if (key == activationKey) {
                inputEl.checked = true;
            }
            else if (typeof value == "boolean") {
                inputEl.checked = value;
            }
            else if (key == "strength") {
                inputEl.value = strength.toFixed(2);
                strengthValueEl.textContent = getStrength(strength).toFixed(2);
            }
            else if (key == "transition") {
                inputEl.value = transition.toString();
                transitionValueEl.textContent = transition + "ms";
            }
        }
    }
    
    function inputChanged() {
        const key = this.getAttribute("key");
        if (this.type == "radio") {
            chrome.storage.sync.set({ activationKey: key });
        }
        else if (key == "strength") {
            const strength = parseFloat(this.value);
            chrome.storage.sync.set({ strength });
            strengthValueEl.textContent = getStrength(strength).toFixed(2);
        }
        else if (key == "transition") {
            const transition = Math.round(parseFloat(this.value));
            chrome.storage.sync.set({ transition });
            transitionValueEl.textContent = transition + "ms";
        }
        else {
            if (key == "disableJavascript")
                toggleJavascript(this);
            else
                chrome.storage.sync.set({ [key]: this.checked });
        }
    }
    
    function toggleJavascript(inputEl) {
        const disableJavascript = inputEl.checked;
        const permissions = ["contentSettings"];
        chrome.permissions.contains({ permissions }, (contains) => {
            if (contains)
                chrome.storage.sync.set({ disableJavascript });
            else
                chrome.permissions.request({ permissions }, (granted) => {
                    if (granted)
                        chrome.storage.sync.set({ disableJavascript });
                    else
                        inputEl.checked = false;
                });
        });
    }
    
    /* Shared functions from content-script */
    function getStrength(percentage) {
        // Reduced strength for smaller zoom steps
        // Maps 0-1 to 0.05-0.5 (step size range)
        if (percentage < 0.5)
            return 0.05 + 0.3 * percentage;  // 0.05 to 0.2
        return 0.2 + 0.6 * (percentage - 0.5);  // 0.2 to 0.5 (fixed to reach 0.5 at max)
    }
    
    function updateStorage(key, value) {
        storage[key] = value;
    }
})();


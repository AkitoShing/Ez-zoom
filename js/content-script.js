"use strict";
(() => {
    const html = document.documentElement;
    let docStyle;
    let targetEl = html;
    let zoomLevel = 0;
    let lastZoomOrigin = { x: 0, y: 0 };
    let isDoubleClick = false;
    let hasScrolledWhileKeyHeld = false; // Track if scrolling occurred while key was held
    
    /* Frames problem */
    const sharedState = {
        inZoom: false,
        isPreparingZoom: false,
        isExitingZoom: false,
        isActivationKeyHeld: false,  // Track if activation key is currently held
    };
    const framePosition = { x: -1, y: -1 };
    
    /* Fullscreen problem */
    let inFullscreenZoom = false;
    let fullscreenEl;
    let fullscreenElAncestors = [];
    
    /* Elements with fixed position problem */
    let fixedElements = [];
    
    /* Storage */
    let storage = {
        activationKey: "ctrlKey",
        holdToZoom: true,
        alwaysFollowCursor: true,
        strength: 0.5, // 0.5 maps to 0.2 via getStrength
        transition: 200,
    };
    
    // Check if chrome.storage is available (may not be in some frames)
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(null, (response) => {
            storage = Object.assign({}, storage, response);
        });
        
        chrome.storage.onChanged.addListener((changes, areaName) => {
            // Only process sync storage changes
            if (areaName !== "sync") return;
            
            for (const key of Object.keys(changes)) {
                const newValue = changes[key].newValue;
                helpers.updateStorage(key, newValue);
                // Reset key states if activation key changed
                if (key === "activationKey") {
                    state.isActivationKeyHeld = false;
                }
                // Log storage updates for debugging (can be removed in production)
                if (key === "strength" || key === "transition") {
                    console.log(`Ez zoom: ${key} updated to`, newValue);
                }
            }
        });
    } else {
        // Fallback: try to load from localStorage if chrome.storage is not available
        // This shouldn't normally happen, but provides a fallback
        console.warn("Ez zoom: chrome.storage.sync not available in this context");
    }
    
    /* Functions */
    const listeners = {
        async onWheel(e) {
            // Check if activation key is held (check both state and event)
            const keyHeld = state.isActivationKeyHeld || helpers.isActivationKeyHeld(e);
            
            // Only zoom if:
            // 1. Key is held AND we're ready to zoom, OR
            // 2. We're already zoomed AND (holdToZoom is enabled OR key is still held)
            const shouldZoom = (keyHeld && helpers.isZoomReady(e)) || 
                              (state.inZoom && (storage.holdToZoom || keyHeld));
            
            if (!shouldZoom) {
                // If zoomed but key not held and holdToZoom disabled, allow normal scroll
                if (state.inZoom && !storage.holdToZoom && !keyHeld) {
                    return; // Don't prevent default scroll
                }
                return;
            }
            
            // Mark that scrolling occurred while key was held
            // Check state first (most reliable), then event modifiers
            if (state.isActivationKeyHeld || (e.ctrlKey && storage.activationKey == "ctrlKey") ||
                (e.altKey && storage.activationKey == "altKey") ||
                (e.shiftKey && storage.activationKey == "shiftKey")) {
                hasScrolledWhileKeyHeld = true;
            }
            
            listeners.stopEvent(e, true);
            if (state.isPreparingZoom || state.isExitingZoom)
                return;
            if (!state.inZoom)
                await control.prepareZoom();
            control.scale(e);
        },
        onMousemove(e) {
            if (!state.inZoom || state.isExitingZoom || !storage.alwaysFollowCursor)
                return;
            // Don't follow cursor when zoomed out (zoomLevel < 0)
            if (zoomLevel < 0)
                return;
            control.transformOrigin(e, 0);
        },
        onKeydown(e) {
            // Track when activation key is pressed (for Alt, Ctrl, Shift)
            if (helpers.isActivationKey(e)) {
                // Reset scroll tracking on the FIRST keydown (not on key repeats)
                // If state.isActivationKeyHeld is already true, this is a key repeat, so don't reset
                // This allows the flag to persist through key repeats during a single zoom session
                const isNewKeyPress = !state.isActivationKeyHeld;
                if (isNewKeyPress) {
                    hasScrolledWhileKeyHeld = false;
                }
                
                // If already zoomed and holdToZoom is disabled, check if we should exit
                if (state.inZoom && !storage.holdToZoom) {
                    // Don't exit immediately - wait for key release to check if scroll happened
                    // This allows user to continue zooming if they hold and scroll again
                }
                state.isActivationKeyHeld = true;
            }
        },
        async onKeyup(e) {
            if (!helpers.isZoomOver(e))
                return;
            
            // Double-check: if the key is still held according to event modifiers, don't process
            // This handles edge cases where keyup might fire but key is still actually held
            if ((e.ctrlKey && storage.activationKey == "ctrlKey") ||
                (e.altKey && storage.activationKey == "altKey") ||
                (e.shiftKey && storage.activationKey == "shiftKey")) {
                // Key is still held according to event - don't process keyup
                return;
            }
            
            // Key released - update state
            state.isActivationKeyHeld = false;
            
            listeners.stopEvent(e);
            
            // Exit zoom on key release if:
            // 1. holdToZoom is enabled (always exit on release), OR
            // 2. holdToZoom is disabled AND no scroll happened (single press to exit)
            if (storage.holdToZoom) {
                if (state.inZoom)
                    control.exitZoom();
                else if (state.isPreparingZoom)
                    isDoubleClick = true;
            } else {
                // holdToZoom disabled: exit only if no scroll happened between press and release
                if (state.inZoom && !hasScrolledWhileKeyHeld) {
                    // Single press without scroll = exit zoom
                    isDoubleClick = true;
                    control.exitZoom();
                }
                // If scroll happened, zoom stays (user can continue adjusting by holding key again)
                hasScrolledWhileKeyHeld = false; // Reset for next time
            }
        },
        onScroll() {
            if (!state.inZoom)
                return;
            helpers.setStyleProperty("--zoom-top", html.scrollTop + "px");
            helpers.setStyleProperty("--zoom-left", html.scrollLeft + "px");
        },
        onStopZoom() {
            control
                .exitZoom(true)
                .then(() => window.dispatchEvent(new Event("zoom-stopped")));
        },
        onMessage({ data, source }) {
            if (!data?.event?.isFrameEvent || !source)
                return;
            if (/onWheel|onMousemove/.test(data.listener)) {
                if (framePosition.x == -1)
                    for (const frame of document.querySelectorAll("frame, iframe")) {
                        if (frame.contentWindow == source) {
                            const style = getComputedStyle(frame);
                            const { x, y } = utils.getOffset(frame);
                            framePosition.x = x + (parseFloat(style.borderLeftWidth) || 0);
                            framePosition.y = y + (parseFloat(style.borderTopWidth) || 0);
                            break;
                        }
                    }
                // Client coordinates become page coordinates after offsets are computed
                data.event.clientX += framePosition.x;
                data.event.clientY += framePosition.y;
            }
            listeners[data.listener](data.event);
        },
        onStateChange(target, key, value) {
            target[key] = value;
            framePosition.x = -1;
            for (const frame of document.querySelectorAll("frame, iframe")) {
                const { contentWindow } = frame;
                if (contentWindow)
                    contentWindow.postMessage(target, "*");
            }
            return true;
        },
        stopEvent(e, force) {
            if (e.isFrameEvent)
                return;
            const { inZoom, isPreparingZoom, isExitingZoom } = state;
            if (inZoom || isPreparingZoom || isExitingZoom || force) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        },
    };
    
    const control = {
        async prepareZoom() {
            state.isPreparingZoom = true;
            isDoubleClick = false; // Reset flag when starting new zoom
            fullscreenEl = (document.fullscreenElement || html);
            if (fullscreenEl != html)
                await control.setFullscreenZoom();
            if (!inFullscreenZoom)
                await control.enableZoom();
            state.isPreparingZoom = false;
            state.inZoom = true;
        },
        async enableZoom() {
            docStyle = html.getAttribute("style") || "";
            const { x, y } = utils.getHTMLScrollbarsWidth();
            helpers.setStyleProperty("width", "calc(100vw - " + x + "px)");
            helpers.setStyleProperty("height", "calc(100vh - " + y + "px)");
            html.setAttribute("in-zoom", "");
            helpers.setStyleProperty("--zoom-top", html.scrollTop + "px");
            helpers.setStyleProperty("--zoom-left", html.scrollLeft + "px");
            fixedElements = (await helpers.getFixedElements()).map((el) => {
                const elInfo = { el, style: el.getAttribute("style") || "" };
                const rect = el.getBoundingClientRect();
                const newTop = rect.top + html.scrollTop + "px";
                const newLeft = rect.left + html.scrollLeft + "px";
                helpers.setStyleProperty("top", newTop, el);
                helpers.setStyleProperty("left", newLeft, el);
                helpers.setStyleProperty("height", rect.height + "px", el);
                helpers.setStyleProperty("width", rect.width + "px", el);
                helpers.setStyleProperty("transition", "none", el);
                return elInfo;
            });
        },
        disableZoom() {
            state.inZoom = false;
            zoomLevel = 0;
            if (inFullscreenZoom)
                return;
            html.setAttribute("style", docStyle);
            html.removeAttribute("in-zoom");
            helpers.resetElementsStyle(fixedElements);
        },
        scale(e) {
            const started = !zoomLevel;
            const zoomType = -Math.sign(e.deltaY);
            const strength = zoomType * helpers.getStrength(storage.strength);
            const divisor = zoomLevel < 0 || (!zoomLevel && zoomType == -1) ? 10 : 1;
            zoomLevel = Math.max(-0.9, zoomLevel + strength / divisor);
            this.transformOrigin(e, zoomType, started);
            helpers.setStyleProperty("transform", `scale(${1 + zoomLevel})`);
            // Reset isDoubleClick when actively zooming to prevent accidental exits
            isDoubleClick = false;
        },
        transformOrigin(e, zoomType, started) {
            const { scrollLeft, scrollTop, clientWidth, clientHeight } = targetEl;
            const useClient = inFullscreenZoom || e.isFrameEvent;
            let [x, y] = useClient ? [e.clientX, e.clientY] : [e.pageX, e.pageY];
            let transition = `transform ${storage.transition}ms`;
            
            // When zooming out (zoomType == -1), preserve the current transform origin
            // This maintains the visual center of what's currently visible
            if (zoomType == -1) {
                // If we have a lastZoomOrigin, use it (preserves current view)
                // Otherwise, use viewport center
                if (lastZoomOrigin.x !== 0 || lastZoomOrigin.y !== 0) {
                    x = lastZoomOrigin.x;
                    y = lastZoomOrigin.y;
                } else {
                    // Fallback to viewport center if no previous origin
                    x = scrollLeft + clientWidth / 2;
                    y = scrollTop + clientHeight / 2;
                    lastZoomOrigin = { x, y };
                }
            }
            // When already zoomed out (zoomLevel < 0), preserve the origin
            else if (zoomLevel < 0) {
                // Preserve the last zoom origin to maintain view position
                if (lastZoomOrigin.x !== 0 || lastZoomOrigin.y !== 0) {
                    x = lastZoomOrigin.x;
                    y = lastZoomOrigin.y;
                } else {
                    x = scrollLeft + clientWidth / 2;
                    y = scrollTop + clientHeight / 2;
                }
            }
            // When zooming in, check if we should follow cursor
            else {
                const shouldFollowCursorInMove = storage.alwaysFollowCursor;
                
                if (!shouldFollowCursorInMove) {
                    if (!started) {
                        const [lastX, lastY] = [lastZoomOrigin.x, lastZoomOrigin.y];
                        x = lastX - ((lastX - x) / (1 + zoomLevel ** 2)) * zoomType;
                        y = lastY - ((lastY - y) / (1 + zoomLevel ** 2)) * zoomType;
                        const right = scrollLeft + clientWidth;
                        const bottom = scrollTop + clientHeight;
                        x = Math.max(scrollLeft - 3, Math.min(x, right + 3));
                        y = Math.max(scrollTop - 3, Math.min(y, bottom + 3));
                        transition += `, transform-origin ${storage.transition}ms`;
                        lastZoomOrigin = { x, y };
                    }
                } else {
                    // When following cursor, update lastZoomOrigin
                    lastZoomOrigin = { x, y };
                }
            }
            helpers.setStyleProperty("transition", zoomType ? transition : "none");
            helpers.setStyleProperty("transform-origin", `${x}px ${y}px`);
        },
        async exitZoom(force) {
            if (state.isExitingZoom)
                return;
            
            // When holdToZoom is disabled, only exit if:
            // 1. It's a forced exit, OR
            // 2. It's an intentional exit (isDoubleClick is true - user pressed key again), OR
            // 3. We're in fullscreen zoom
            // Otherwise, prevent accidental exits when key is still held
            if (!force && !storage.holdToZoom && !inFullscreenZoom) {
                if (!isDoubleClick) {
                    // Not an intentional exit - cancel it
                    isDoubleClick = true; // Set flag for next time
                    return;
                }
            }
            
            // Reset flag and proceed with exit
            isDoubleClick = false;
            state.isExitingZoom = true;
            const transition = `transform ${storage.transition}ms`;
            helpers.setStyleProperty("transition", transition);
            helpers.setStyleProperty("transform", "none");
            if (inFullscreenZoom)
                await control.removeFullscreenZoom();
            else
                await utils.sleep(storage.transition);
            control.disableZoom();
            targetEl = html;
            state.isExitingZoom = false;
        },
        async setFullscreenZoom() {
            inFullscreenZoom = true;
            await utils.switchToFullscreenEl(html);
            const ancestors = [fullscreenEl, ...utils.getAncestors(fullscreenEl)];
            fullscreenElAncestors = ancestors.map((el) => {
                const temp = { el, style: el.getAttribute("style") || "" };
                if (el != fullscreenEl)
                    helpers.disableContainingBlock(el);
                return temp;
            });
            helpers.setTargetEl(fullscreenEl);
        },
        async removeFullscreenZoom() {
            inFullscreenZoom = false;
            await utils.switchToFullscreenEl(fullscreenEl);
            helpers.resetElementsStyle(fullscreenElAncestors);
        },
    };
    
    const helpers = {
        isZoomReady(e) {
            return ((e.altKey && storage.activationKey == "altKey") ||
                (e.ctrlKey && storage.activationKey == "ctrlKey") ||
                (e.shiftKey && storage.activationKey == "shiftKey"));
        },
        isActivationKey(e) {
            // Check if the pressed key matches the activation key setting
            return ((e.key == "Alt" && storage.activationKey == "altKey") ||
                (e.key == "Control" && storage.activationKey == "ctrlKey") ||
                (e.key == "Shift" && storage.activationKey == "shiftKey"));
        },
        isActivationKeyHeld(e) {
            // Check if activation key is currently held (for wheel events)
            return (e.altKey && storage.activationKey == "altKey") ||
                   (e.ctrlKey && storage.activationKey == "ctrlKey") ||
                   (e.shiftKey && storage.activationKey == "shiftKey");
        },
        isZoomOver(e) {
            return ((e.key == "Alt" && storage.activationKey == "altKey") ||
                (e.key == "Control" && storage.activationKey == "ctrlKey") ||
                (e.key == "Shift" && storage.activationKey == "shiftKey"));
        },
        async getFixedElements(useDebugger) {
            let selectors = "[style*='position:fixed'],[style*='position: fixed']";
            const moreSelectors = useDebugger
                ? (await new Promise((resolve) => {
                    const request = { message: "GET_FIXED_ELEMENT_SELECTORS" };
                    chrome.runtime.sendMessage(request, resolve);
                })).filter(utils.isSelectorValid)
                : utils.getFixedElementSelectors();
            if (moreSelectors.length)
                selectors += "," + moreSelectors.join(",");
            return [...html.querySelectorAll(selectors)].filter((el) => getComputedStyle(el).position == "fixed");
        },
        getStrength(percentage) {
            // Reduced strength for smaller zoom steps
            // Maps 0-1 to 0.05-0.5 (step size range)
            if (percentage < 0.5)
                return 0.05 + 0.3 * percentage;  // 0.05 to 0.2
            return 0.2 + 0.6 * (percentage - 0.5);  // 0.2 to 0.5 (fixed to reach 0.5 at max)
        },
        setTargetEl(el) {
            targetEl = el;
            this.setStyleProperty("position", "fixed");
            this.setStyleProperty("top", "0");
            this.setStyleProperty("left", "0");
            this.setStyleProperty("width", "100vw");
            this.setStyleProperty("height", "100vh");
            this.setStyleProperty("outline", "3px solid red");
            this.setStyleProperty("box-shadow", "0 0 15px 3px red");
            this.setStyleProperty("z-index", "9999999999999999999");
            if (inFullscreenZoom)
                this.setStyleProperty("background", "black");
        },
        setStyleProperty(key, value, el) {
            (el || targetEl).style.setProperty(key, value, "important");
        },
        disableContainingBlock(el) {
            this.setStyleProperty("filter", "none", el);
            this.setStyleProperty("transform", "none", el);
            this.setStyleProperty("backdrop-filter", "none", el);
            this.setStyleProperty("perspective", "none", el);
            this.setStyleProperty("contain", "none", el);
            this.setStyleProperty("transform-style", "initial", el);
            this.setStyleProperty("content-visibility", "initial", el);
            this.setStyleProperty("will-change", "initial", el);
            this.setStyleProperty("z-index", "9999999999999999999", el);
        },
        resetElementsStyle(elements) {
            elements.forEach(({ el, style }) => el.setAttribute("style", style));
        },
        updateStorage(key, value) {
            storage[key] = value;
        },
    };
    
    const utils = {
        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        },
        *getAncestors(el) {
            while ((el = el.parentElement))
                yield el;
        },
        getHTMLScrollbarsWidth() {
            const { clientWidth, clientHeight } = html;
            const { innerWidth, innerHeight } = window;
            return { x: innerWidth - clientWidth, y: innerHeight - clientHeight };
        },
        getOffset(el) {
            let [x, y] = [0, 0];
            while (el) {
                x += el.offsetLeft;
                y += el.offsetTop;
                el = el.offsetParent;
            }
            return { x, y };
        },
        getFixedElementSelectors() {
            let selectors = [];
            for (const stylesheet of document.styleSheets) {
                if (stylesheet.disabled)
                    continue;
                try {
                    for (const rule of stylesheet.cssRules) {
                        if (!(rule instanceof CSSStyleRule))
                            continue;
                        if (rule.style.position == "fixed")
                            selectors.push(rule.selectorText);
                    }
                }
                catch (e) { } // CORS
            }
            return selectors;
        },
        isSelectorValid(selector) {
            try {
                document.createDocumentFragment().querySelector(selector);
            }
            catch (e) {
                return false;
            }
            return true;
        },
        async switchToFullscreenEl(el) {
            try {
                await document.exitFullscreen();
            }
            catch (e) { }
            try {
                await el.requestFullscreen();
            }
            catch (e) { }
        },
    };
    
    /* Listeners Registration */
    const state = new Proxy(sharedState, { set: listeners.onStateChange });
    const options = { passive: false, capture: true };
    window.addEventListener("wheel", listeners.onWheel, options);
    window.addEventListener("mousemove", listeners.onMousemove, true);
    window.addEventListener("keydown", listeners.onKeydown, true);
    window.addEventListener("keyup", listeners.onKeyup, true);
    window.addEventListener("scroll", listeners.onScroll, true);
    window.addEventListener("stop-zoom", listeners.onStopZoom);
    window.addEventListener("message", listeners.onMessage);
    
    // Reset key state when window loses focus (prevents stuck state)
    window.addEventListener("blur", () => {
        state.isActivationKeyHeld = false;
    });
})();



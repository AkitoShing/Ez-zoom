# Ez zoom - Page Zoom Extension

Pinch-to-zoom convenience, now on your desktop.

Hold right-click (or Ctrl/Alt/Shift) and spin the mouse wheel to zoom toward the cursor. Enjoy the convenience of pinch-to-zoom functionality from touch screens, now available on your desktop.

## Features

- **Right-Click + Mouse Wheel** to zoom (default)
- **Alternative Key Bindings**: Alt, Ctrl, or Shift + Mouse Wheel
- **Zoom toward cursor** - Like pinch-to-zoom on touchscreens
- **Configurable settings**:
  - Hold to zoom (zoom resets when key released)
  - Always follow cursor (viewport follows mouse movement)
  - Adjustable zoom strength (0.05 to 0.5 step size for finer control)
  - Adjustable smoothness (0ms to 400ms animation)

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **"Load unpacked"**
5. Select the project folder

## Usage

### Basic Usage

1. **Hold Right-Click** (or your chosen key) and **scroll the mouse wheel** to zoom
2. **Scroll down** = Zoom in
3. **Scroll up** = Zoom out
4. **Release the key** (if "Hold to zoom" is enabled) or **press the key again** to exit zoom

### Configuration

Click the extension icon to open the popup and configure:

- **Key Binding**: Choose RClick, Alt, Ctrl, or Shift
- **Hold to zoom**: Enable to reset zoom when key is released
- **Always follow cursor**: Enable to have zoom origin follow mouse movement
- **Strength**: Adjust zoom sensitivity (0.0 = slow, 1.0 = fast)
- **Smoothness**: Adjust animation duration (0ms = instant, 400ms = smooth)

## Technical Details

- Uses CSS `transform: scale()` for zooming
- Applies transform to `<html>` element
- Handles fixed position elements automatically
- Supports fullscreen elements
- Works with iframes
- Settings sync across devices via Chrome sync storage

## Known Limitations

**Zoom Out Behavior**: The zoom-out effect may not be perfect. Page layout can be affected, especially for fixed-position elements such as navigation bars, headers, and footers. These elements may appear to shift or float during zoom-out operations. This is a known limitation of the current zoom implementation and may be improved in future versions.

## Browser Support

- Chrome ✓
- Chromium-based browsers ✓

## Development

This is a Chrome extension built with Manifest V3. The extension uses content scripts to inject zoom functionality into web pages.

## License

Free to use and modify personally or commercially. Not for resale.

## Credits

Original extension concept and implementation by Kristijan Rosandić.
This is a recreation based on the original SmoothZoom extension, now rebranded as Ez zoom.

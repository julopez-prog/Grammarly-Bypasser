# Grammarly Blur Toggle

This is a Chrome and Edge Manifest V3 browser extension that toggles off CSS blur on elements already rendered by `grammarly.com`.

The extension changes the appearance of the current page. It does not bypass authentication, call hidden APIs, remove a subscription requirement, or reconstruct text that was never delivered to the browser.

## Folder Structure

```text
GRAMMARLY_PLUS_CHECKER/
|-- manifest.json   Extension metadata and permissions
|-- content.js      Code injected into Grammarly pages
|-- popup.html      Popup user interface markup
|-- popup.css       Popup styling
|-- popup.js        Popup behavior and communication
|-- README.md       This documentation
```

## How the Extension Works

The extension has two separate execution environments:

1. The content script runs inside matching Grammarly pages. It scans the page, identifies elements whose computed CSS contains a `blur(...)` filter, and can inject an overriding stylesheet.
2. The popup runs only while the user has the extension popup open. It displays the toggle and sends messages to the content script in the active tab.

The general flow is:

```text
Open Grammarly page
        |
        v
Chrome injects content.js
        |
        v
content.js scans for CSS blur and stores the enabled state
        |
        v
User opens the extension popup
        |
        v
popup.js asks content.js for the current state
        |
        v
User changes the toggle
        |
        v
content.js adds or removes an overriding <style> element
```

## `manifest.json`

`manifest.json` is the entry point for a Manifest V3 extension. The browser reads it when the extension is loaded.

### Basic metadata

```json
"manifest_version": 3,
"name": "Grammarly Blur Toggle",
"version": "1.0.0",
"description": "Toggles client-side visual blur on grammarly.com pages."
```

- `manifest_version` selects the browser extension platform. Manifest V3 is the current Chrome and Edge format.
- `name` is the extension name shown in the extensions page and popup-related browser UI.
- `version` identifies the release version. Increase it when distributing an updated package.
- `description` briefly explains what the extension does.

### Permissions and host access

```json
"permissions": ["storage", "activeTab"],
"host_permissions": [
  "https://grammarly.com/*",
  "https://*.grammarly.com/*"
]
```

- `storage` allows the extension to save the on/off state with `chrome.storage.local`.
- `activeTab` allows temporary access to the active tab when the popup is used.
- `host_permissions` declares the Grammarly URLs where the extension is allowed to run.
- `https://*.grammarly.com/*` includes Grammarly subdomains, such as an editor hosted on a subdomain.

### Popup and content script registration

```json
"action": {
  "default_title": "Toggle Grammarly blur",
  "default_popup": "popup.html"
}
```

This tells the browser to open `popup.html` when the extension toolbar button is clicked.

```json
"content_scripts": [
  {
    "matches": ["https://grammarly.com/*", "https://*.grammarly.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }
]
```

- `matches` limits injection to Grammarly pages.
- `js` specifies the script to inject.
- `document_idle` waits until the page is mostly loaded before starting the script.

## `content.js`

`content.js` runs in every matching Grammarly page. It is responsible for finding blurred elements, adding the visual override, watching for dynamic page changes, saving the setting, and responding to the popup.

### Private scope and constants

```js
(() => {
  const STYLE_ID = "grammarly-blur-toggle-style";
  const MARKER = "data-grammarly-blur-toggle";
  let enabled = false;
```

The immediately invoked function expression keeps variables private to this script and avoids accidentally conflicting with Grammarly's own JavaScript.

- `STYLE_ID` identifies the injected stylesheet so it can be removed or replaced.
- `MARKER` is a custom HTML attribute added to elements that appear blurred.
- `enabled` stores the current state in memory for the current page.

### Detecting blur

```js
function hasBlur(element) {
  const style = getComputedStyle(element);
  return /blur\(/i.test(style.filter) || /blur\(/i.test(style.webkitFilter);
}
```

`getComputedStyle` reads the final CSS applied by the browser, including CSS from Grammarly and its stylesheets. The function checks both the standard `filter` property and the WebKit-prefixed `-webkit-filter` property for a `blur(...)` function.

### Marking matching elements

```js
function markBlurredElements() {
  document.querySelectorAll("*").forEach((element) => {
    if (hasBlur(element)) element.setAttribute(MARKER, "true");
  });
}
```

This scans all elements currently in the document. A blurred element receives an attribute such as:

```html
<div data-grammarly-blur-toggle="true">...</div>
```

The attribute gives the injected CSS a precise selector without changing the element's text or HTML content.

### Enabling and disabling the override

```js
function setEnabled(nextEnabled) {
  enabled = nextEnabled;
  document.getElementById(STYLE_ID)?.remove();
```

Every state change first removes an old override. This prevents duplicate style elements when the user repeatedly clicks the toggle.

When enabled, the script adds this style:

```css
[data-grammarly-blur-toggle="true"] {
  filter: none !important;
  -webkit-filter: none !important;
  text-shadow: none !important;
  opacity: 1 !important;
}
```

- `filter: none` removes the standard CSS filter.
- `-webkit-filter: none` handles browsers that use the prefixed property.
- `text-shadow: none` removes a possible text-obscuring shadow.
- `opacity: 1` prevents the text from remaining visually faded.
- `!important` gives the override higher CSS priority than ordinary page rules.

The style is appended to the document head, or to the document root if the head is not available yet.

Finally, the setting is saved:

```js
chrome.storage.local.set({ enabled });
```

This means the same on/off preference is used on later Grammarly pages in the same browser profile.

### Handling dynamic content

Grammarly can update its interface after the initial page load. The script uses a `MutationObserver`:

```js
observer = new MutationObserver(() => markBlurredElements());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style"]
});
```

The observer rescans after:

- New elements are added.
- Existing elements are removed or rearranged.
- A class or inline style changes.

This allows the extension to notice review suggestions that appear after the editor initially loads.

### Restoring the saved state

```js
chrome.storage.local.get({ enabled: false }, ({ enabled: savedEnabled }) => {
  start();
  setEnabled(savedEnabled);
});
```

The default is `false`, so the extension does not change the page until the user enables it. On later page loads, the saved state is restored.

### Communication with the popup

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "set-enabled") {
    setEnabled(Boolean(message.enabled));
    sendResponse({ enabled });
  }
  if (message.type === "get-enabled") sendResponse({ enabled });
  return true;
});
```

The content script supports two messages:

- `get-enabled`: returns the current state to the popup.
- `set-enabled`: changes the state and returns the resulting state.

## `popup.html`

`popup.html` defines the small interface shown when the toolbar icon is clicked.

Important parts include:

```html
<input id="enabled" type="checkbox">
<span class="switch" aria-hidden="true"></span>
<p id="status">Checking this page...</p>
```

- The checkbox is the actual control used by JavaScript.
- The adjacent `switch` element is a visual toggle styled by `popup.css`.
- The status paragraph gives feedback such as whether the feature is enabled or whether the current tab is unsupported.

The page loads its stylesheet and script with:

```html
<link rel="stylesheet" href="popup.css">
<script src="popup.js"></script>
```

## `popup.css`

`popup.css` controls only the extension popup. It does not style Grammarly pages.

It defines:

- The popup width and system font.
- Spacing and heading styles.
- The switch track and circular thumb.
- The checked state using `input:checked + .switch`.
- Normal and error status colors.

The checkbox is visually hidden with opacity, while the styled span displays the switch. The checkbox remains in the document so it can be clicked and controlled with JavaScript.

## `popup.js`

`popup.js` runs when the popup opens. It finds the controls, checks the active tab, asks the content script for its current state, and sends updates when the checkbox changes.

### Finding the controls

```js
const checkbox = document.getElementById("enabled");
const status = document.getElementById("status");
```

These references connect JavaScript to the checkbox and status message from `popup.html`.

### Displaying status

```js
function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#b3261e" : "#087f73";
}
```

This updates the popup without reloading it. Error messages use a different color to distinguish unsupported pages or communication failures.

### Checking the active tab

```js
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
```

The popup requests the active tab in the current browser window. If the URL is not a Grammarly URL, the checkbox is disabled because the content script is not available there.

### Reading the current state

```js
chrome.tabs.sendMessage(tab.id, { type: "get-enabled" }, (response) => {
```

The popup sends a message to `content.js`. If the page has not been reloaded since the extension was installed, the content script may not exist yet. In that case the popup asks the user to reload the page.

### Changing the state

When the checkbox changes, the popup sends:

```js
{
  type: "set-enabled",
  enabled: checkbox.checked
}
```

The content script then adds or removes its CSS override. The response is used to update the status message.

## Installation

1. Open Chrome or Edge.
2. Navigate to `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select this project folder, the folder containing `manifest.json`.
6. Open or reload a Grammarly page.
7. Click the extension icon.
8. Enable **Remove client-side blur**.

After changing extension files, return to the extensions page and click the extension's **Reload** button. Reload the Grammarly tab afterward so the updated content script is injected.

## Testing and Debugging

### Validate JavaScript

From the project folder, run:

```powershell
node --check content.js
node --check popup.js
```

No output indicates that the JavaScript syntax is valid.

### Validate the manifest

```powershell
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('manifest.json','utf8')); console.log('manifest.json: valid JSON')"
```

### Inspect the content script

1. Open the Grammarly page.
2. Open browser developer tools with `F12`.
3. Use the Console tab to inspect errors.
4. In the Elements tab, search for `data-grammarly-blur-toggle="true"`.
5. If an element is marked, inspect its computed `filter` and `-webkit-filter` values.

### Inspect the popup

1. Open the extension popup.
2. Right-click inside it.
3. Select **Inspect**.
4. Check the popup Console for errors from `popup.js`.

Common causes of failure include an unsupported URL, a Grammarly page that was not reloaded after installation, or a browser page that blocks extension scripts.

## Limitations and Responsible Use

This extension can only remove a visual CSS effect from text that is already present in the page DOM. It cannot:

- Recover content omitted from the HTML.
- Decrypt or reconstruct server-only data.
- Bypass login or subscription checks.
- Access Grammarly's private APIs.
- Guarantee compatibility with future Grammarly interface changes.

The extension is intended for inspecting client-side rendering and accessibility-related testing on pages you are authorized to use. Respect Grammarly's terms, account permissions, and content licensing requirements.

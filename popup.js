const checkbox = document.getElementById("enabled");
const status = document.getElementById("status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#b3261e" : "#087f73";
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.id || !tab.url?.includes("grammarly.com")) {
    checkbox.disabled = true;
    setStatus("Open a grammarly.com page to use this.", true);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "get-enabled" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      checkbox.disabled = true;
      setStatus("Reload the page, then try again.", true);
      return;
    }
    checkbox.checked = response.enabled;
    setStatus(response.enabled ? "Blur removal is on." : "Blur removal is off.");
  });
});

checkbox.addEventListener("change", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, {
      type: "set-enabled",
      enabled: checkbox.checked
    }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setStatus("Could not update this page.", true);
        return;
      }
      setStatus(response.enabled ? "Blur removal is on." : "Blur removal is off.");
    });
  });
});

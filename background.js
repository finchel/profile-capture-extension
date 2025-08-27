// Background Service Worker

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        // Download file
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: false
        }).then(downloadId => {
            sendResponse({ success: true, downloadId });
        }).catch(error => {
            console.error('Download error:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Keep message channel open
    }
    
    if (request.action === 'screenshot') {
        // Capture screenshot
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                        console.error('Screenshot error:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    
                    // Convert data URL to downloadable format
                    chrome.downloads.download({
                        url: dataUrl,
                        filename: request.filename,
                        saveAs: false
                    }).then(downloadId => {
                        sendResponse({ success: true, downloadId });
                    }).catch(error => {
                        console.error('Screenshot download error:', error);
                        sendResponse({ success: false, error: error.message });
                    });
                });
            }
        });
        
        return true; // Keep message channel open
    }
});

// Clean up old storage data periodically (keep last 100 profiles)
chrome.runtime.onStartup.addListener(async () => {
    try {
        const data = await chrome.storage.local.get(null);
        const profileKeys = Object.keys(data)
            .filter(key => key.startsWith('profile_'))
            .sort()
            .reverse(); // Most recent first

        if (profileKeys.length > 100) {
            const keysToRemove = profileKeys.slice(100);
            for (const key of keysToRemove) {
                await chrome.storage.local.remove(key);
            }
            console.log(`Cleaned up ${keysToRemove.length} old profile captures`);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
});
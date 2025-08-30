// Background Service Worker - Simplified & Stable

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request.action);
    
    if (request.action === 'download') {
        // Download file with folder structure
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: false,
            conflictAction: 'uniquify'
        }).then(downloadId => {
            console.log('Download started:', downloadId, request.filename);
            sendResponse({ success: true, downloadId });
        }).catch(error => {
            console.error('Download error:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Keep message channel open
    }
    
    if (request.action === 'screenshot') {
        console.log('Taking screenshot...');
        
        // Capture screenshot
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                sendResponse({ success: false, error: 'No active tab found' });
                return;
            }
            
            chrome.tabs.captureVisibleTab(tabs[0].windowId, { 
                format: 'png',
                quality: 90
            }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error('Screenshot error:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                
                console.log('Screenshot captured successfully');
                sendResponse({ success: true, dataUrl });
            });
        });
        
        return true; // Keep message channel open
    }
    
    if (request.action === 'cleanup') {
        console.log('Manual cleanup requested');
        cleanupExpiredMetadata().then(result => {
            sendResponse({ success: true, cleaned: result });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        
        return true;
    }
});

// Simple cleanup function
async function cleanupExpiredMetadata() {
    try {
        const data = await chrome.storage.local.get(null);
        const now = new Date().toISOString();
        const expiredKeys = [];
        
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('capture_') && value.expiresAt && value.expiresAt < now) {
                expiredKeys.push(key);
            }
        }
        
        if (expiredKeys.length > 0) {
            await chrome.storage.local.remove(expiredKeys);
            console.log(`Cleanup: Removed ${expiredKeys.length} expired records`);
        }
        
        return expiredKeys.length;
        
    } catch (error) {
        console.error('Cleanup error:', error);
        throw error;
    }
}

// Basic startup cleanup (without alarms)
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started - running cleanup');
    cleanupExpiredMetadata().catch(console.error);
});

// Run cleanup when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed/updated - running cleanup');
    cleanupExpiredMetadata().catch(console.error);
});

console.log('Background script loaded successfully');
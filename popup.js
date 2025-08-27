document.addEventListener('DOMContentLoaded', async () => {
    const captureBtn = document.getElementById('captureBtn');
    const viewDataBtn = document.getElementById('viewDataBtn');
    const statusDiv = document.getElementById('status');
    const detectedSiteDiv = document.getElementById('detectedSite');

    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;
    
    // Detect current site
    let siteType = 'unknown';
    if (url.includes('linkedin.com')) {
        siteType = 'LinkedIn';
        detectedSiteDiv.textContent = '🔵 LinkedIn Profile Detected';
    } else if (url.includes('contacts.google.com')) {
        siteType = 'Google Contacts';
        detectedSiteDiv.textContent = '🟢 Google Contacts Detected';
    } else {
        detectedSiteDiv.textContent = '⚠️ Unsupported Site';
        captureBtn.disabled = true;
        captureBtn.textContent = 'Site Not Supported';
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }

    captureBtn.addEventListener('click', async () => {
        try {
            captureBtn.disabled = true;
            captureBtn.textContent = 'Capturing...';
            showStatus('Capturing profile data...', 'processing');

            // Send message to content script to start capture
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'captureProfile',
                siteType: siteType
            });

            if (response && response.success) {
                showStatus(`✅ Profile captured: ${response.profileName}`, 'success');
                captureBtn.textContent = '📸 Capture Current Profile';
            } else {
                throw new Error(response?.error || 'Capture failed');
            }

        } catch (error) {
            console.error('Capture error:', error);
            showStatus(`❌ Error: ${error.message}`, 'error');
            captureBtn.textContent = '📸 Capture Current Profile';
        } finally {
            captureBtn.disabled = false;
        }
    });

    viewDataBtn.addEventListener('click', async () => {
        try {
            // Open the downloads folder or show stored data
            const data = await chrome.storage.local.get(null);
            const profiles = Object.keys(data).filter(key => key.startsWith('profile_'));
            
            if (profiles.length === 0) {
                showStatus('No captured profiles found', 'error');
                return;
            }

            // Create and download a summary file
            const summary = profiles.map(key => {
                const profile = data[key];
                return {
                    name: profile.profileName,
                    site: profile.siteType,
                    url: profile.url,
                    capturedAt: profile.timestamp,
                    dataSize: profile.htmlData ? profile.htmlData.length : 0
                };
            });

            const blob = new Blob([JSON.stringify(summary, null, 2)], 
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            await chrome.downloads.download({
                url: url,
                filename: `profile_capture_summary_${new Date().toISOString().split('T')[0]}.json`
            });

            showStatus(`📁 Summary downloaded (${profiles.length} profiles)`, 'success');

        } catch (error) {
            console.error('View data error:', error);
            showStatus(`❌ Error: ${error.message}`, 'error');
        }
    });
});
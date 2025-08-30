// Content Script - Minimal Working Version

class ProfileCaptureManager {
    constructor() {
        this.sessionId = Date.now().toString();
        this.captureCount = 0;
        this.debugLog = {};
    }

    async captureProfile(siteType) {
        try {
            this.captureCount++;
            
            const timestamp = new Date().toISOString();
            const profileName = this.extractProfileName(siteType);
            
            const dateFolder = `ProfileCapture_${timestamp.split('T')[0].replace(/-/g, '')}`;
            const timeStamp = timestamp.split('T')[1].split('.')[0].replace(/:/g, '');
            const profileFolder = `${profileName}_${timeStamp}`;
            
            const captureData = await this.gatherProfileData(siteType);
            const userSelections = await this.showPreviewModal(captureData, profileName);
            
            if (userSelections.confirmed) {
                await this.downloadSelectedFiles(captureData, dateFolder, profileFolder, userSelections);
                return { success: true, profileName, folder: `${dateFolder}/${profileFolder}` };
            } else {
                return { success: false, message: 'Capture cancelled by user' };
            }
            
        } catch (error) {
            console.error('Profile capture error:', error);
            throw error;
        }
    }

    async gatherProfileData(siteType) {
        const data = {
            metadata: {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                siteType: siteType,
                sessionId: this.sessionId,
                captureNumber: this.captureCount
            }
        };

        if (siteType === 'LinkedIn') {
            data.extractedData = await this.extractLinkedInData();
        } else if (siteType === 'Google Contacts') {
            data.extractedData = this.extractGoogleContactsData();
        }

        data.htmlContent = document.documentElement.outerHTML;
        data.screenshot = await this.captureScreenshot();
        
        return data;
    }

    async extractLinkedInData() {
        console.log('Extracting LinkedIn data...');
        const data = this.extractBasicProfileData();
        
        console.log('Starting contact info extraction process...');
        try {
            const contactInfo = await this.extractContactInfo();
            data.contactInfo = contactInfo;
            console.log('Contact info extraction completed:', contactInfo);
        } catch (error) {
            console.error('Contact info extraction failed:', error);
            data.contactInfo = { error: error.message };
        }
        
        console.log('LinkedIn data extraction complete:', data);
        return data;
    }

    extractBasicProfileData() {
        console.log('Starting basic profile data extraction...');
        const data = {};
        
        // Name extraction with debugging
        console.log('Extracting name...');
        const nameSelectors = [
            'h1[data-anonymize="person-name"]',
            '.pv-text-details__left-panel h1',
            'h1.break-words',
            '.mt2 h1'
        ];
        
        for (const selector of nameSelectors) {
            const nameEl = document.querySelector(selector);
            console.log(`Name selector "${selector}":`, nameEl ? nameEl.textContent.trim() : 'not found');
            if (nameEl && nameEl.textContent.trim()) {
                data.name = nameEl.textContent.trim();
                console.log('Name extracted:', data.name);
                break;
            }
        }
        
        // Headline extraction with debugging
        console.log('Extracting headline...');
        const headlineSelectors = [
            '.pv-text-details__left-panel .text-body-medium:first-child',
            '.pv-top-card--list .text-body-medium:first-child',
            '.mt2 .text-body-medium'
        ];
        
        for (const selector of headlineSelectors) {
            const headlineEl = document.querySelector(selector);
            console.log(`Headline selector "${selector}":`, headlineEl ? headlineEl.textContent.trim() : 'not found');
            if (headlineEl && headlineEl.textContent.trim()) {
                const text = headlineEl.textContent.trim();
                if (text.length < 200 && !text.includes('hashtag')) {
                    data.headline = text;
                    console.log('Headline extracted:', data.headline);
                    break;
                }
            }
        }
        
        // Location extraction with debugging
        console.log('Extracting location...');
        const locationSelectors = [
            '.uSalSqvXiPNemcNJFXjunEfiCMOCJTWIaEaZM .text-body-small.inline.t-black--light.break-words',
            '.pv-text-details__left-panel .text-body-small.inline.t-black--light',
            '.mt2 .text-body-small.t-black--light'
        ];
        
        for (const selector of locationSelectors) {
            const locationEl = document.querySelector(selector);
            console.log(`Location selector "${selector}":`, locationEl ? locationEl.textContent.trim() : 'not found');
            if (locationEl && locationEl.textContent.trim()) {
                const text = locationEl.textContent.trim();
                if (!text.includes('Contact info')) {
                    data.location = text;
                    console.log('Location extracted:', data.location);
                    break;
                }
            }
        }
        
        console.log('Basic profile extraction complete:', data);
        return data;
    }

    async extractContactInfo() {
        const contactButton = document.querySelector('a[href*="overlay/contact-info"]');
        if (!contactButton) {
            return { note: 'Contact info button not found' };
        }
        
        contactButton.click();
        await this.waitForModal();
        const contactData = this.extractFromModal();
        this.closeModal();
        
        return contactData;
    }

    async waitForModal() {
        return new Promise((resolve) => {
            let attempts = 0;
            const checkModal = () => {
                const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
                if (modal && modal.offsetHeight > 0) {
                    setTimeout(resolve, 300);
                    return;
                }
                
                attempts++;
                if (attempts < 20) {
                    setTimeout(checkModal, 100);
                } else {
                    resolve();
                }
            };
            checkModal();
        });
    }

    extractFromModal() {
        const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
        if (!modal) {
            return {};
        }
        
        const data = {};
        
        // Email
        const emailLink = modal.querySelector('a[href^="mailto:"]');
        if (emailLink) {
            data.email = emailLink.href.replace('mailto:', '');
        }
        
        // Phone
        const phoneHeaders = modal.querySelectorAll('h3');
        for (const header of phoneHeaders) {
            if (header.textContent.trim() === 'Phone') {
                const phoneSection = header.closest('.pv-contact-info__contact-type');
                if (phoneSection) {
                    const phoneSpan = phoneSection.querySelector('.t-14.t-black.t-normal');
                    if (phoneSpan) {
                        data.phone = phoneSpan.textContent.trim();
                    }
                }
            }
        }
        
        // Profile URL
        const profileLink = modal.querySelector('a[href*="linkedin.com/in/"]');
        if (profileLink) {
            data.profileUrl = profileLink.href;
        }
        
        // Websites
        const websiteHeaders = modal.querySelectorAll('h3');
        for (const header of websiteHeaders) {
            if (header.textContent.trim() === 'Website') {
                const websiteSection = header.closest('.pv-contact-info__contact-type');
                if (websiteSection) {
                    const links = websiteSection.querySelectorAll('a[href^="http"]:not([href*="linkedin.com"])');
                    if (links.length > 0) {
                        data.websites = Array.from(links).map(link => link.href);
                    }
                }
            }
        }
        
        return data;
    }

    closeModal() {
        const closeButton = document.querySelector('.artdeco-modal__dismiss, [data-test-modal-close-btn]');
        if (closeButton) {
            closeButton.click();
        }
    }

    async showPreviewModal(captureData, profileName) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'profile-preview-overlay';
            modal.innerHTML = this.getPreviewHTML(captureData, profileName);
            
            this.injectPreviewStyles();
            document.body.appendChild(modal);
            
            modal.querySelector('#preview-continue').onclick = () => {
                const selections = this.getSelections(modal);
                document.body.removeChild(modal);
                resolve({ confirmed: true, selections: selections });
            };
            
            modal.querySelector('#preview-cancel').onclick = () => {
                document.body.removeChild(modal);
                resolve({ confirmed: false });
            };
        });
    }

    getPreviewHTML(captureData, profileName) {
        const data = captureData.extractedData;
        
        return `
            <div class="preview-modal-content">
                <h2>Profile Data Preview: ${profileName}</h2>
                <div class="preview-section">
                    <h3>Basic Information</h3>
                    <div class="preview-item">
                        <input type="checkbox" data-field="name" ${data.name ? 'checked' : 'disabled'}>
                        <label><strong>Name:</strong> ${data.name || 'Not found'}</label>
                    </div>
                    <div class="preview-item">
                        <input type="checkbox" data-field="headline" ${data.headline ? 'checked' : 'disabled'}>
                        <label><strong>Headline:</strong> ${data.headline || 'Not found'}</label>
                    </div>
                    <div class="preview-item">
                        <input type="checkbox" data-field="location" ${data.location ? 'checked' : 'disabled'}>
                        <label><strong>Location:</strong> ${data.location || 'Not found'}</label>
                    </div>
                </div>
                
                <div class="preview-section">
                    <h3>Contact Information</h3>
                    <div class="preview-item">
                        <input type="checkbox" data-field="email" ${data.contactInfo?.email ? 'checked' : 'disabled'}>
                        <label><strong>Email:</strong> ${data.contactInfo?.email || 'Not found'}</label>
                    </div>
                    <div class="preview-item">
                        <input type="checkbox" data-field="phone" ${data.contactInfo?.phone ? 'checked' : 'disabled'}>
                        <label><strong>Phone:</strong> ${data.contactInfo?.phone || 'Not found'}</label>
                    </div>
                    <div class="preview-item">
                        <input type="checkbox" data-field="websites" ${data.contactInfo?.websites ? 'checked' : 'disabled'}>
                        <label><strong>Websites:</strong> ${data.contactInfo?.websites?.join(', ') || 'Not found'}</label>
                    </div>
                </div>
                
                <div class="preview-buttons">
                    <button id="preview-cancel">Cancel</button>
                    <button id="preview-continue">Download Selected Data</button>
                </div>
            </div>
        `;
    }

    injectPreviewStyles() {
        if (document.getElementById('preview-modal-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'preview-modal-styles';
        styles.textContent = `
            .profile-preview-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0,0,0,0.7) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            .preview-modal-content {
                background: white !important;
                padding: 24px !important;
                border-radius: 8px !important;
                max-width: 600px !important;
                max-height: 80vh !important;
                overflow-y: auto !important;
                font-family: Arial, sans-serif !important;
            }
            .preview-section {
                margin-bottom: 20px !important;
                border-bottom: 1px solid #eee !important;
                padding-bottom: 16px !important;
            }
            .preview-section h3 {
                color: #0a66c2 !important;
                margin-bottom: 12px !important;
            }
            .preview-item {
                display: flex !important;
                align-items: flex-start !important;
                margin-bottom: 8px !important;
                padding: 4px !important;
            }
            .preview-item input {
                margin-right: 8px !important;
                margin-top: 2px !important;
            }
            .preview-buttons {
                display: flex !important;
                justify-content: flex-end !important;
                gap: 12px !important;
                margin-top: 20px !important;
            }
            .preview-buttons button {
                padding: 10px 20px !important;
                border: none !important;
                border-radius: 4px !important;
                cursor: pointer !important;
            }
            #preview-continue {
                background: #0a66c2 !important;
                color: white !important;
            }
            #preview-cancel {
                background: #666 !important;
                color: white !important;
            }
        `;
        document.head.appendChild(styles);
    }

    getSelections(modal) {
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.dataset.field);
    }

    async downloadSelectedFiles(captureData, dateFolder, profileFolder, userSelections) {
        const basePath = `${dateFolder}/${profileFolder}`;
        const selected = userSelections.selections;
        
        const filteredData = {};
        if (selected.includes('name') && captureData.extractedData.name) {
            filteredData.name = captureData.extractedData.name;
        }
        if (selected.includes('headline') && captureData.extractedData.headline) {
            filteredData.headline = captureData.extractedData.headline;
        }
        if (selected.includes('location') && captureData.extractedData.location) {
            filteredData.location = captureData.extractedData.location;
        }
        
        if (captureData.extractedData.contactInfo) {
            const contactInfo = {};
            if (selected.includes('email') && captureData.extractedData.contactInfo.email) {
                contactInfo.email = captureData.extractedData.contactInfo.email;
            }
            if (selected.includes('phone') && captureData.extractedData.contactInfo.phone) {
                contactInfo.phone = captureData.extractedData.contactInfo.phone;
            }
            if (selected.includes('websites') && captureData.extractedData.contactInfo.websites) {
                contactInfo.websites = captureData.extractedData.contactInfo.websites;
            }
            if (Object.keys(contactInfo).length > 0) {
                filteredData.contactInfo = contactInfo;
            }
        }
        
        await this.downloadFile(JSON.stringify(filteredData, null, 2), `${basePath}/extracted_data.json`);
        await this.downloadFile(captureData.htmlContent, `${basePath}/full_page.html`);
        
        if (captureData.screenshot) {
            await this.downloadScreenshot(captureData.screenshot, `${basePath}/screenshot.png`);
        }
    }

    async downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'download',
                url: url,
                filename: filename
            }, (response) => {
                URL.revokeObjectURL(url);
                if (response?.success) {
                    resolve(response.downloadId);
                } else {
                    reject(new Error(response?.error || 'Download failed'));
                }
            });
        });
    }

    async downloadScreenshot(dataUrl, filename) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'download',
                url: dataUrl,
                filename: filename
            }, (response) => {
                if (response?.success) {
                    resolve(response.downloadId);
                } else {
                    reject(new Error(response?.error || 'Screenshot download failed'));
                }
            });
        });
    }

    async captureScreenshot() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'screenshot' }, (response) => {
                if (response?.success) {
                    resolve(response.dataUrl);
                } else {
                    console.warn('Screenshot failed:', response?.error);
                    resolve(null);
                }
            });
        });
    }

    extractProfileName(siteType) {
        console.log('Extracting profile name for folder...');
        
        if (siteType === 'LinkedIn') {
            const selectors = [
                'h1[data-anonymize="person-name"]',
                '.pv-text-details__left-panel h1',
                'h1.break-words',
                '.mt2 h1'
            ];
            
            for (const selector of selectors) {
                const nameEl = document.querySelector(selector);
                console.log(`Profile name selector "${selector}":`, nameEl ? nameEl.textContent.trim() : 'not found');
                if (nameEl && nameEl.textContent.trim()) {
                    const cleanName = nameEl.textContent.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
                    console.log('Clean profile name:', cleanName);
                    return cleanName;
                }
            }
        }
        
        console.log('Profile name defaulting to Unknown');
        return 'Unknown';
    }

    extractGoogleContactsData() {
        const data = {};
        const nameEl = document.querySelector('[data-test-id="contact-details-name"]');
        if (nameEl) data.name = nameEl.textContent.trim();
        return data;
    }
}

const captureManager = new ProfileCaptureManager();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureProfile') {
        captureManager.captureProfile(request.siteType)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});
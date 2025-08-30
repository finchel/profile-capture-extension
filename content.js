// Content Script - Revised for File-Based Storage with Contact Info Extraction

class ProfileCaptureManager {
    constructor() {
        this.sessionId = Date.now().toString();
        this.captureCount = 0;
    }

    async captureProfile(siteType) {
        try {
            this.captureCount++;
            const timestamp = new Date().toISOString();
            const profileName = this.extractProfileName(siteType);
            
            // Create folder structure: ProfileCapture_YYYYMMDD/ProfileName_HHmmss/
            const dateFolder = `ProfileCapture_${timestamp.split('T')[0].replace(/-/g, '')}`;
            const timeStamp = timestamp.split('T')[1].split('.')[0].replace(/:/g, '');
            const profileFolder = `${profileName}_${timeStamp}`;
            
            // Capture data
            const captureData = await this.gatherProfileData(siteType);
            
            // Download files immediately in organized structure
            await this.downloadProfileFiles(captureData, dateFolder, profileFolder);
            
            // Store minimal metadata only (for 14-day cleanup)
            await this.storeMetadata(profileName, timestamp, dateFolder, profileFolder);
            
            return { 
                success: true, 
                profileName,
                folder: `${dateFolder}/${profileFolder}`
            };
            
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

        // Extract structured data based on site (before HTML capture)
        if (siteType === 'LinkedIn') {
            console.log('Extracting LinkedIn data with contact info...');
            data.extractedData = await this.extractLinkedInDataWithContactInfo();
        } else if (siteType === 'Google Contacts') {
            data.extractedData = this.extractGoogleContactsData();
        }

        // Capture full HTML/DOM after data extraction (includes any loaded modals)
        data.htmlContent = document.documentElement.outerHTML;

        // Get page screenshot via background script
        data.screenshot = await this.captureScreenshot();
        
        return data;
    }

    async downloadProfileFiles(data, dateFolder, profileFolder) {
        const basePath = `${dateFolder}/${profileFolder}`;
        
        // 1. Download metadata JSON
        await this.downloadFile(
            JSON.stringify(data.metadata, null, 2),
            `${basePath}/metadata.json`,
            'application/json'
        );
        
        // 2. Download extracted data JSON
        await this.downloadFile(
            JSON.stringify(data.extractedData, null, 2),
            `${basePath}/extracted_data.json`,
            'application/json'
        );
        
        // 3. Download full HTML
        await this.downloadFile(
            data.htmlContent,
            `${basePath}/full_page.html`,
            'text/html'
        );
        
        // 4. Download screenshot
        if (data.screenshot) {
            await this.downloadScreenshotFile(data.screenshot, `${basePath}/screenshot.png`);
        }
        
        // 5. Download parsing instructions for your future tool
        const parsingInstructions = this.generateParsingInstructions(data.metadata.siteType);
        await this.downloadFile(
            parsingInstructions,
            `${basePath}/parsing_guide.md`,
            'text/markdown'
        );
    }

    async downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve, reject) => {
            console.log('Requesting download:', filename);
            
            chrome.runtime.sendMessage({
                action: 'download',
                url: url,
                filename: filename
            }, (response) => {
                URL.revokeObjectURL(url);
                
                if (chrome.runtime.lastError) {
                    console.error('Runtime error during download:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (response?.success) {
                    console.log('Download successful:', filename);
                    resolve(response.downloadId);
                } else {
                    console.error('Download failed:', response?.error);
                    reject(new Error(response?.error || 'Download failed'));
                }
            });
        });
    }

    async downloadScreenshotFile(dataUrl, filename) {
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

    async storeMetadata(profileName, timestamp, dateFolder, profileFolder) {
        // Store only minimal data for cleanup purposes
        const metadataKey = `capture_${Date.now()}`;
        const metadata = {
            profileName,
            timestamp,
            folderPath: `${dateFolder}/${profileFolder}`,
            expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days
        };
        
        await chrome.storage.local.set({ [metadataKey]: metadata });
    }

    async captureScreenshot() {
        return new Promise((resolve, reject) => {
            console.log('Requesting screenshot from background...');
            
            chrome.runtime.sendMessage({ action: 'screenshot' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error during screenshot:', chrome.runtime.lastError);
                    resolve(null); // Don't fail entire capture
                    return;
                }
                
                if (response?.success) {
                    console.log('Screenshot received successfully');
                    resolve(response.dataUrl);
                } else {
                    console.warn('Screenshot failed:', response?.error);
                    resolve(null); // Don't fail entire capture for screenshot issues
                }
            });
        });
    }

    extractProfileName(siteType) {
        let name = 'Unknown';
        
        if (siteType === 'LinkedIn') {
            // Try multiple selectors for LinkedIn profile names
            const selectors = [
                'h1[data-anonymize="person-name"]',
                '.pv-text-details__left-panel h1',
                '.ph5.pb5 h1',
                'h1.break-words'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    name = element.textContent.trim();
                    break;
                }
            }
        } else if (siteType === 'Google Contacts') {
            const nameElement = document.querySelector('[data-test-id="contact-details-name"]') ||
                               document.querySelector('.contact-name') ||
                               document.querySelector('h2[role="heading"]');
            if (nameElement) {
                name = nameElement.textContent.trim();
            }
        }
        
        // Clean filename
        return name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
    }

    async extractLinkedInDataWithContactInfo() {
        console.log('Starting LinkedIn data extraction with contact info...');
        
        // First, extract basic profile data
        const data = this.extractLinkedInBasicData();
        
        // Now attempt to get contact info
        try {
            console.log('Attempting to extract contact info...');
            const contactInfo = await this.extractContactInfo();
            if (contactInfo && Object.keys(contactInfo).length > 0) {
                data.contactInfo = contactInfo;
                console.log('Contact info extracted successfully:', contactInfo);
            } else {
                console.log('No contact info found or accessible');
                data.contactInfo = { note: 'Contact info not accessible or not found' };
            }
        } catch (error) {
            console.error('Error extracting contact info:', error);
            data.contactInfo = { error: error.message };
        }
        
        return data;
    }

    extractLinkedInBasicData() {
        // Enhanced LinkedIn data extraction (basic profile info)
        const data = {};
        
        // Name - try multiple selectors for different LinkedIn layouts
        const nameSelectors = [
            'h1[data-anonymize="person-name"]',
            '.pv-text-details__left-panel h1',
            '.ph5.pb5 h1',
            'h1.break-words',
            '.pv-top-card--list h1',
            '.mt2 h1'
        ];
        for (const selector of nameSelectors) {
            const nameEl = document.querySelector(selector);
            if (nameEl && nameEl.textContent.trim()) {
                data.name = nameEl.textContent.trim();
                console.log('Found name with selector:', selector, '| Name:', data.name);
                break;
            }
        }
        
        // Headline/Title - be more specific to avoid activity feed content
        const headlineSelectors = [
            '.pv-text-details__left-panel .text-body-medium:first-child',
            '.pv-top-card--list .text-body-medium:first-child', 
            '.pv-text-details__left-panel .break-words:not(h1)',
            '.mt2 .text-body-medium:first-child',
            '.pv-top-card-profile-picture + div .text-body-medium:first-child'
        ];
        for (const selector of headlineSelectors) {
            const headlineEl = document.querySelector(selector);
            if (headlineEl && headlineEl.textContent.trim() && 
                !headlineEl.textContent.includes('hashtag') && 
                !headlineEl.textContent.includes('🎙️') &&
                headlineEl.textContent.length < 200) { // Reasonable headline length
                data.headline = headlineEl.textContent.trim();
                console.log('Found headline with selector:', selector, '| Headline:', data.headline);
                break;
            }
        }
        
        // Location - target the specific element you provided
        const locationSelectors = [
            '.uSalSqvXiPNemcNJFXjunEfiCMOCJTWIaEaZM .text-body-small.inline.t-black--light.break-words',
            '.pv-text-details__left-panel .pb2 .t-black--light span',
            '.pv-top-card--list .pb2 span:not([class*="contact"])',
            '.mt2 .pb2 span.text-body-small.t-black--light',
            '.pv-text-details__left-panel .text-body-small.inline.t-black--light'
        ];
        for (const selector of locationSelectors) {
            const locationEl = document.querySelector(selector);
            if (locationEl && locationEl.textContent.trim() && 
                !locationEl.textContent.includes('Contact info') &&
                !locationEl.textContent.includes('hashtag')) {
                data.location = locationEl.textContent.trim();
                console.log('Found location with selector:', selector, '| Location:', data.location);
                break;
            }
        }
        
        // Connection count
        const connectionEl = document.querySelector('.pv-top-card--list .t-black--light span');
        if (connectionEl && connectionEl.textContent.includes('connection')) {
            data.connections = connectionEl.textContent.trim();
            console.log('Found connections:', data.connections);
        }
        
        // Experience section
        const experienceSection = document.querySelector('#experience, [data-section="experience"]');
        if (experienceSection) {
            const experiences = experienceSection.querySelectorAll('.pv-entity__summary-info, .pvs-entity');
            data.experience = Array.from(experiences).map(exp => exp.innerText.trim()).filter(Boolean);
            console.log('Found experience entries:', data.experience.length);
        }
        
        // Education section
        const educationSection = document.querySelector('#education, [data-section="education"]');
        if (educationSection) {
            const education = educationSection.querySelectorAll('.pv-entity__summary-info, .pvs-entity');
            data.education = Array.from(education).map(edu => edu.innerText.trim()).filter(Boolean);
            console.log('Found education entries:', data.education.length);
        }
        
        // Skills section
        const skillsSection = document.querySelector('#skills, [data-section="skills"]');
        if (skillsSection) {
            const skills = skillsSection.querySelectorAll('.pv-skill-category-entity__name span, .pvs-entity span');
            data.skills = Array.from(skills).map(skill => skill.textContent.trim()).filter(Boolean);
            console.log('Found skills:', data.skills.length);
        }
        
        // About section
        const aboutSection = document.querySelector('#about, [data-section="summary"]');
        if (aboutSection) {
            const aboutText = aboutSection.querySelector('.pv-shared-text-with-see-more span, .pvs-entity span');
            if (aboutText) {
                data.about = aboutText.innerText.trim();
                console.log('Found about section, length:', data.about.length);
            }
        }
        
        // Debug logging for problematic fields
        console.log('=== BASIC DATA EXTRACTION SUMMARY ===');
        console.log('Name:', data.name || 'NOT FOUND');
        console.log('Headline:', data.headline || 'NOT FOUND'); 
        console.log('Location:', data.location || 'NOT FOUND');
        console.log('=== END BASIC DATA SUMMARY ===');
        
        return data;
    }

    async extractContactInfo() {
        // Multiple selectors for the contact info link/button
        const contactInfoSelectors = [
            'a[data-control-name="contact_see_more"]',
            'button[data-control-name="contact_see_more"]',
            'a[href*="overlay/contact-info"]',
            '.pv-contact-info__contact-type button',
            '.pv-top-card-v2-ctas button[data-control-name="contact_see_more"]',
            'button[aria-label*="contact info"]',
            'button[aria-label*="Contact info"]',
            '.pv-top-card--list-bullet .pv-contact-info__contact-type button',
            'section[data-section="contactInfo"] button'
        ];

        let contactButton = null;
        
        // Find the contact info button
        for (const selector of contactInfoSelectors) {
            contactButton = document.querySelector(selector);
            if (contactButton) {
                console.log('Found contact info button with selector:', selector);
                break;
            }
        }

        if (!contactButton) {
            console.log('Contact info button not found, checking for direct contact info...');
            // Sometimes contact info is directly visible without a button
            return this.extractDirectContactInfo();
        }

        // Click the contact info button
        console.log('Clicking contact info button...');
        contactButton.click();

        // Wait for the modal/overlay to appear
        await this.waitForContactInfoModal();

        // Extract contact info from the modal
        const contactData = this.extractContactInfoFromModal();

        // Close the modal
        await this.closeContactInfoModal();

        return contactData;
    }

    async waitForContactInfoModal() {
        const modalSelectors = [
            '.pv-contact-info__contact-info-modal',
            '[data-test-modal-container]',
            '.artdeco-modal',
            '.contact-info',
            '.pv-profile-section__contact-info'
        ];

        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20; // 2 seconds max wait
            
            const checkForModal = () => {
                attempts++;
                
                for (const selector of modalSelectors) {
                    const modal = document.querySelector(selector);
                    if (modal && modal.offsetHeight > 0) {
                        console.log('Contact info modal found:', selector);
                        // Give it a moment to fully load
                        setTimeout(resolve, 200);
                        return;
                    }
                }
                
                if (attempts < maxAttempts) {
                    setTimeout(checkForModal, 100);
                } else {
                    console.log('Contact info modal not found after waiting');
                    resolve();
                }
            };
            
            checkForModal();
        });
    }

    extractContactInfoFromModal() {
        console.log('=== MODAL EXTRACTION START ===');
        
        // First, log the modal structure
        const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
        if (modal) {
            console.log('Modal found, innerHTML length:', modal.innerHTML.length);
            console.log('Modal text content preview:', modal.innerText.substring(0, 200));
        } else {
            console.log('❌ No modal found for extraction');
            return {};
        }
        
        const contactData = {};
        
        // Multiple strategies to extract contact info from modal
        const strategies = [
            () => this.extractContactInfoStrategy1(),
            () => this.extractContactInfoStrategy2(),
            () => this.extractContactInfoStrategy3()
        ];
        
        strategies.forEach((strategy, index) => {
            try {
                console.log(`--- Running Strategy ${index + 1} ---`);
                const result = strategy();
                console.log(`Strategy ${index + 1} result:`, result);
                
                if (result && Object.keys(result).length > 0) {
                    Object.assign(contactData, result);
                    console.log(`✅ Strategy ${index + 1} contributed data`);
                } else {
                    console.log(`⚠️ Strategy ${index + 1} returned no data`);
                }
            } catch (error) {
                console.error(`❌ Strategy ${index + 1} failed:`, error);
            }
        });
        
        console.log('=== FINAL CONTACT DATA ===', contactData);
        console.log('=== MODAL EXTRACTION END ===');
        
        return contactData;
    }

    extractContactInfoStrategy1() {
        // Strategy 1: Look for contact info in current modal structure
        const data = {};
        
        // Find the modal container first
        const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
        if (!modal) return data;
        
        console.log('Strategy 1: Searching in modal...');
        
        // Profile URL - look for LinkedIn profile links
        const profileLinks = modal.querySelectorAll('a[href*="linkedin.com/in/"]');
        profileLinks.forEach(link => {
            if (link.href && link.href.includes('linkedin.com/in/')) {
                data.profileUrl = link.href;
                console.log('Found profile URL:', link.href);
            }
        });
        
        // Email - look for mailto links
        const emailLinks = modal.querySelectorAll('a[href^="mailto:"]');
        emailLinks.forEach(link => {
            const email = link.href.replace('mailto:', '');
            data.email = email;
            console.log('Found email:', email);
        });
        
        // Phone - look in phone sections (not always in links)
        const phoneHeaders = modal.querySelectorAll('h3');
        phoneHeaders.forEach(header => {
            if (header.textContent.trim() === 'Phone') {
                const phoneSection = header.closest('.pv-contact-info__contact-type');
                if (phoneSection) {
                    const phoneSpan = phoneSection.querySelector('.t-14.t-black.t-normal');
                    if (phoneSpan && phoneSpan.textContent.trim()) {
                        data.phone = phoneSpan.textContent.trim();
                        console.log('Found phone:', data.phone);
                    }
                }
            }
        });
        
        // Websites - look for external links
        const allLinks = modal.querySelectorAll('a[href^="http"]:not([href*="linkedin.com"])');
        const websites = [];
        allLinks.forEach(link => {
            if (link.href && !link.href.includes('linkedin.com')) {
                websites.push(link.href);
                console.log('Found website:', link.href);
            }
        });
        if (websites.length > 0) {
            data.websites = websites;
        }
        
        // Birthday - look for birthday section
        const birthdayHeaders = modal.querySelectorAll('h3');
        birthdayHeaders.forEach(header => {
            if (header.textContent.trim() === 'Birthday') {
                const birthdaySection = header.closest('.pv-contact-info__contact-type');
                if (birthdaySection) {
                    const birthdaySpan = birthdaySection.querySelector('.t-14.t-black.t-normal');
                    if (birthdaySpan && birthdaySpan.textContent.trim()) {
                        data.birthday = birthdaySpan.textContent.trim();
                        console.log('Found birthday:', data.birthday);
                    }
                }
            }
        });
        
        return data;
    }

    extractContactInfoStrategy2() {
        // Strategy 2: Text pattern matching in modal
        const data = {};
        const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
        
        if (!modal) return data;
        
        console.log('Strategy 2: Text pattern matching...');
        
        const modalText = modal.innerText;
        
        // Email pattern - more comprehensive
        const emailPatterns = [
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
        ];
        
        emailPatterns.forEach(pattern => {
            const matches = modalText.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const email = match.replace('mailto:', '');
                    if (!data.email && email.includes('@')) {
                        data.email = email;
                        console.log('Strategy 2 found email:', email);
                    }
                });
            }
        });
        
        // Phone patterns - Israeli and international formats
        const phonePatterns = [
            /\b05\d{8}\b/g,  // Israeli mobile: 05XXXXXXXX
            /\b\+972[- ]?5\d[- ]?\d{3}[- ]?\d{4}\b/g,  // +972 format
            /\b\(?(\d{3})\)?[- ]?(\d{3})[- ]?(\d{4})\b/g  // General format
        ];
        
        phonePatterns.forEach(pattern => {
            const matches = modalText.match(pattern);
            if (matches && !data.phone) {
                data.phone = matches[0].trim();
                console.log('Strategy 2 found phone:', data.phone);
            }
        });
        
        return data;
    }

    extractContactInfoStrategy3() {
        // Strategy 3: DOM traversal approach
        const data = {};
        const modal = document.querySelector('[data-test-modal-container], .artdeco-modal-overlay');
        
        if (!modal) return data;
        
        console.log('Strategy 3: DOM traversal...');
        
        // Look for contact type sections
        const contactSections = modal.querySelectorAll('.pv-contact-info__contact-type');
        
        contactSections.forEach(section => {
            const header = section.querySelector('h3');
            if (!header) return;
            
            const headerText = header.textContent.trim();
            console.log('Processing section:', headerText);
            
            switch(headerText) {
                case 'Email':
                    const emailLink = section.querySelector('a[href^="mailto:"]');
                    if (emailLink) {
                        data.email = emailLink.href.replace('mailto:', '');
                        console.log('Strategy 3 found email:', data.email);
                    }
                    break;
                    
                case 'Phone':
                    const phoneSpan = section.querySelector('.t-14.t-black.t-normal');
                    if (phoneSpan) {
                        data.phone = phoneSpan.textContent.trim();
                        console.log('Strategy 3 found phone:', data.phone);
                    }
                    break;
                    
                case 'Website':
                    const websiteLinks = section.querySelectorAll('a[href^="http"]:not([href*="linkedin.com"])');
                    if (websiteLinks.length > 0) {
                        data.websites = Array.from(websiteLinks).map(link => link.href);
                        console.log('Strategy 3 found websites:', data.websites);
                    }
                    break;
                    
                case 'Your Profile':
                    const profileLink = section.querySelector('a[href*="linkedin.com/in/"]');
                    if (profileLink) {
                        data.profileUrl = profileLink.href;
                        console.log('Strategy 3 found profile:', data.profileUrl);
                    }
                    break;
                    
                case 'Birthday':
                    const birthdaySpan = section.querySelector('.t-14.t-black.t-normal');
                    if (birthdaySpan) {
                        data.birthday = birthdaySpan.textContent.trim();
                        console.log('Strategy 3 found birthday:', data.birthday);
                    }
                    break;
            }
        });
        
        return data;
    }

    extractDirectContactInfo() {
        // Sometimes contact info is visible directly on the page
        const data = {};
        
        // Look for contact info section
        const contactSection = document.querySelector('.pv-contact-info, .contact-info, .pv-top-card--list-bullet');
        
        if (contactSection) {
            // Extract any visible links
            const links = contactSection.querySelectorAll('a[href]');
            links.forEach(link => {
                const href = link.href;
                if (href.includes('mailto:')) {
                    data.email = href.replace('mailto:', '');
                } else if (href.includes('tel:')) {
                    data.phone = href.replace('tel:', '');
                } else if (href.includes('linkedin.com/in/')) {
                    data.profileUrl = href;
                }
            });
        }
        
        return data;
    }

    async closeContactInfoModal() {
        const closeSelectors = [
            '.pv-contact-info__contact-info-modal button[aria-label*="Dismiss"]',
            '.artdeco-modal__dismiss',
            '.artdeco-modal button[data-control-name="overlay.close_wc_contact_info"]',
            '[data-test-modal-close-btn]',
            '.artdeco-modal .artdeco-button--circle'
        ];
        
        for (const selector of closeSelectors) {
            const closeButton = document.querySelector(selector);
            if (closeButton) {
                console.log('Closing contact info modal...');
                closeButton.click();
                // Wait for modal to close
                await new Promise(resolve => setTimeout(resolve, 500));
                return;
            }
        }
        
        // Fallback: try pressing Escape key
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    extractGoogleContactsData() {
        // Extract Google Contacts data
        const data = {};
        
        // Name
        const nameEl = document.querySelector('[data-test-id="contact-details-name"]');
        if (nameEl) data.name = nameEl.textContent.trim();
        
        // Phone numbers
        const phoneEls = document.querySelectorAll('[data-test-id*="phone"]');
        data.phones = Array.from(phoneEls).map(el => el.textContent.trim()).filter(Boolean);
        
        // Emails
        const emailEls = document.querySelectorAll('[data-test-id*="email"]');
        data.emails = Array.from(emailEls).map(el => el.textContent.trim()).filter(Boolean);
        
        // Address
        const addressEls = document.querySelectorAll('[data-test-id*="address"]');
        data.addresses = Array.from(addressEls).map(el => el.textContent.trim()).filter(Boolean);
        
        return data;
    }

    generateParsingInstructions(siteType) {
        return `# Profile Data Parsing Guide

## Captured on: ${new Date().toISOString()}
## Site Type: ${siteType}

### File Structure:
- **metadata.json**: Capture metadata and session info
- **extracted_data.json**: Pre-parsed structured data INCLUDING CONTACT INFO
- **full_page.html**: Complete HTML/DOM for advanced parsing (includes loaded contact modals)
- **screenshot.png**: Visual reference
- **parsing_guide.md**: This file

### Contact Info Extraction Process:
The capture script automatically:
1. Clicks the "Contact Info" link/button
2. Waits for the modal/overlay to load
3. Extracts contact details from the modal
4. Closes the modal
5. Captures the full page HTML (including any loaded data)

### Parsing Strategy for ${siteType}:

${siteType === 'LinkedIn' ? `
#### LinkedIn Profile Parsing:

**Contact Information (High Priority):**
- **Email**: Extracted from contact modal, saved in extracted_data.json
- **Phone**: Extracted from contact modal, saved in extracted_data.json  
- **Profile URL**: LinkedIn profile URL from contact modal
- **Websites**: Personal/company websites from contact modal
- **Location**: Geographic location

**Profile Data:**
- **Name**: Multiple selectors tried for different LinkedIn layouts
- **Headline**: Professional headline/current position
- **About**: Summary/about section
- **Experience**: Work history and positions
- **Education**: Educational background
- **Skills**: Listed skills and endorsements
- **Connections**: Connection count if visible

#### Advanced LinkedIn Parsing Notes:
- Contact info is extracted via automated modal interaction
- LinkedIn uses dynamic class names, prioritize data-* attributes
- Contact info access depends on:
  - Connection level with profile owner
  - Privacy settings
  - LinkedIn Premium status
- Modal selectors: .pv-contact-info__contact-info-modal, .artdeco-modal
- Email patterns: mailto: links and regex extraction
- Phone patterns: tel: links and number regex

#### Contact Info Modal Selectors:
- Button: a[data-control-name="contact_see_more"]
- Modal: .pv-contact-info__contact-info-modal
- Email: .pv-contact-info__contact-info-modal a[href^="mailto:"]  
- Phone: .pv-contact-info__contact-info-modal a[href^="tel:"]
- Close: .artdeco-modal__dismiss
` : ''}

${siteType === 'Google Contacts' ? `
#### Google Contacts Parsing:
1. **Primary Fields**: Use data-test-id attributes
2. **Phone**: [data-test-id*="phone"] elements
3. **Email**: [data-test-id*="email"] elements  
4. **Address**: [data-test-id*="address"] elements
5. **Custom Fields**: Look for data-field-type attributes

#### Advanced Parsing Notes:
- Google Contacts uses consistent data-test-id patterns
- Multiple entries per field type are common
- Check for formatted vs raw data in different elements
` : ''}

### Data Reliability:
**High Confidence:** Data in extracted_data.json.contactInfo
**Medium Confidence:** Basic profile fields
**Manual Review:** Check screenshot for visual confirmation

### Contact Info Accessibility:
- ✅ **Success**: contactInfo object populated with email/phone/websites
- ⚠️ **Limited**: contactInfo.note indicates restricted access
- ❌ **Error**: contactInfo.error indicates extraction failure

### Recommended Processing:
1. **Primary Source**: Use extracted_data.json for structured data
2. **Fallback**: Parse full_page.html for missed information
3. **Validation**: Compare against screenshot.png
4. **Contact Priority**: Email > Phone > LinkedIn Profile URL > Websites

### Performance Notes:
- Contact info extraction adds 2-3 seconds to capture time
- Modal interactions may fail on slow networks
- Rate limiting: Wait 5+ seconds between profile captures
`;
    }
}

// Initialize manager
const captureManager = new ProfileCaptureManager();

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureProfile') {
        captureManager.captureProfile(request.siteType)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open
    }
});

// Cleanup expired metadata on page load
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'cleanup') {
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
                console.log(`Cleaned up ${expiredKeys.length} expired capture records`);
            }
            
            sendResponse({ success: true, cleaned: expiredKeys.length });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
});
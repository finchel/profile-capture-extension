// Content Script - Runs on LinkedIn and Google Contacts pages

class ProfileCapturer {
    constructor() {
        this.siteType = null;
        this.profileData = {};
    }

    // LinkedIn profile data extraction
    extractLinkedInData() {
        const data = {
            name: '',
            title: '',
            currentEmployer: '',
            location: '',
            email: '',
            phone: '',
            about: '',
            experience: [],
            education: [],
            profileUrl: window.location.href
        };

        try {
            // Name - multiple possible selectors
            const nameSelectors = [
                'h1.text-heading-xlarge',
                '.pv-text-details__left-panel h1',
                '.ph5 h1',
                '[data-generated-suggestion-target] h1'
            ];
            
            for (const selector of nameSelectors) {
                const nameEl = document.querySelector(selector);
                if (nameEl) {
                    data.name = nameEl.textContent.trim();
                    break;
                }
            }

            // Title/Headline
            const titleSelectors = [
                '.text-body-medium.break-words',
                '.pv-text-details__left-panel .text-body-medium',
                '.ph5 .text-body-medium'
            ];
            
            for (const selector of titleSelectors) {
                const titleEl = document.querySelector(selector);
                if (titleEl && !titleEl.textContent.includes('@')) {
                    data.title = titleEl.textContent.trim();
                    break;
                }
            }

            // Current employer - extract from title or experience section
            if (data.title.includes(' at ')) {
                data.currentEmployer = data.title.split(' at ').pop().trim();
            }

            // Location
            const locationEl = document.querySelector('.text-body-small.inline.t-black--light.break-words');
            if (locationEl) {
                data.location = locationEl.textContent.trim();
            }

            // About section
            const aboutEl = document.querySelector('.pv-shared-text-with-see-more .inline-show-more-text');
            if (aboutEl) {
                data.about = aboutEl.textContent.trim();
            }

            // Experience section
            const experienceSection = document.querySelector('#experience');
            if (experienceSection) {
                const experienceItems = experienceSection.closest('section')?.querySelectorAll('.pvs-list__item--line-separated') || [];
                
                experienceItems.forEach(item => {
                    const titleEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]');
                    const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
                    const durationEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
                    
                    if (titleEl) {
                        data.experience.push({
                            title: titleEl.textContent.trim(),
                            company: companyEl ? companyEl.textContent.trim() : '',
                            duration: durationEl ? durationEl.textContent.trim() : ''
                        });
                    }
                });
            }

            // Contact info (if available)
            const contactSection = document.querySelector('[data-section="contactinfo"]');
            if (contactSection) {
                // Email
                const emailEl = contactSection.querySelector('a[href^="mailto:"]');
                if (emailEl) {
                    data.email = emailEl.href.replace('mailto:', '');
                }

                // Phone
                const phoneEl = contactSection.querySelector('a[href^="tel:"]');
                if (phoneEl) {
                    data.phone = phoneEl.href.replace('tel:', '');
                }
            }

        } catch (error) {
            console.warn('LinkedIn data extraction error:', error);
        }

        return data;
    }

    // Google Contacts data extraction
    extractGoogleContactsData() {
        const data = {
            name: '',
            email: '',
            phone: '',
            organization: '',
            title: '',
            address: '',
            notes: '',
            profileUrl: window.location.href
        };

        try {
            // Name
            const nameEl = document.querySelector('[data-field-id="name"] input') || 
                          document.querySelector('.z80M1 .notranslate');
            if (nameEl) {
                data.name = nameEl.value || nameEl.textContent?.trim() || '';
            }

            // Email
            const emailEls = document.querySelectorAll('[data-field-id="email"] input');
            if (emailEls.length > 0) {
                data.email = Array.from(emailEls).map(el => el.value).filter(Boolean).join(', ');
            }

            // Phone
            const phoneEls = document.querySelectorAll('[data-field-id="phone"] input');
            if (phoneEls.length > 0) {
                data.phone = Array.from(phoneEls).map(el => el.value).filter(Boolean).join(', ');
            }

            // Organization
            const orgEl = document.querySelector('[data-field-id="organization"] input');
            if (orgEl) {
                data.organization = orgEl.value || '';
            }

            // Title
            const titleEl = document.querySelector('[data-field-id="title"] input');
            if (titleEl) {
                data.title = titleEl.value || '';
            }

            // Address
            const addressEls = document.querySelectorAll('[data-field-id="address"] textarea');
            if (addressEls.length > 0) {
                data.address = Array.from(addressEls).map(el => el.value).filter(Boolean).join('; ');
            }

            // Notes
            const notesEl = document.querySelector('[data-field-id="notes"] textarea');
            if (notesEl) {
                data.notes = notesEl.value || '';
            }

        } catch (error) {
            console.warn('Google Contacts data extraction error:', error);
        }

        return data;
    }

    // Generic data extraction based on site type
    extractProfileData(siteType) {
        switch (siteType) {
            case 'LinkedIn':
                return this.extractLinkedInData();
            case 'Google Contacts':
                return this.extractGoogleContactsData();
            default:
                return { profileUrl: window.location.href };
        }
    }

    // Generate safe filename from profile name
    generateSafeFileName(profileData) {
        let baseName = 'unknown_profile';
        
        if (profileData.name && profileData.name.trim()) {
            baseName = profileData.name.trim();
        } else if (profileData.email) {
            baseName = profileData.email.split('@')[0];
        } else if (profileData.title) {
            baseName = profileData.title.trim();
        }

        // Clean filename
        return baseName
            .replace(/[^a-zA-Z0-9\s-_]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .substring(0, 50) || 'unknown_profile';
    }

    // Main capture function
    async captureProfile(siteType) {
        try {
            // Extract profile data
            const profileData = this.extractProfileData(siteType);
            const fileName = this.generateSafeFileName(profileData);
            
            // Get full HTML
            const htmlData = document.documentElement.outerHTML;
            
            // Create comprehensive data package
            const captureData = {
                profileName: fileName,
                siteType: siteType,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                extractedData: profileData,
                htmlData: htmlData,
                domStructure: {
                    title: document.title,
                    metaData: Array.from(document.querySelectorAll('meta')).map(meta => ({
                        name: meta.name,
                        property: meta.property,
                        content: meta.content
                    })),
                    headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
                        tag: h.tagName,
                        text: h.textContent.trim()
                    }))
                }
            };

            // Store in Chrome storage
            const storageKey = `profile_${fileName}_${Date.now()}`;
            await chrome.storage.local.set({
                [storageKey]: captureData
            });

            // Take screenshot and download files
            await this.downloadFiles(fileName, captureData);

            return {
                success: true,
                profileName: fileName,
                dataSize: htmlData.length
            };

        } catch (error) {
            console.error('Capture error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Download files to organized folders
    async downloadFiles(fileName, captureData) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `profile_captures/${fileName}_${timestamp.split('T')[0]}`;

        try {
            // Download HTML file
            const htmlBlob = new Blob([captureData.htmlData], { type: 'text/html' });
            const htmlUrl = URL.createObjectURL(htmlBlob);
            
            await chrome.runtime.sendMessage({
                action: 'download',
                url: htmlUrl,
                filename: `${folderName}/${fileName}_full_page.html`
            });

            // Download extracted data as JSON
            const jsonBlob = new Blob([JSON.stringify(captureData.extractedData, null, 2)], 
                { type: 'application/json' });
            const jsonUrl = URL.createObjectURL(jsonBlob);
            
            await chrome.runtime.sendMessage({
                action: 'download',
                url: jsonUrl,
                filename: `${folderName}/${fileName}_extracted_data.json`
            });

            // Download complete capture data
            const fullDataBlob = new Blob([JSON.stringify(captureData, null, 2)], 
                { type: 'application/json' });
            const fullDataUrl = URL.createObjectURL(fullDataBlob);
            
            await chrome.runtime.sendMessage({
                action: 'download',
                url: fullDataUrl,
                filename: `${folderName}/${fileName}_complete_capture.json`
            });

            // Take and download screenshot
            await chrome.runtime.sendMessage({
                action: 'screenshot',
                filename: `${folderName}/${fileName}_screenshot.png`
            });

        } catch (error) {
            console.warn('Download error:', error);
        }
    }
}

// Initialize capturer
const capturer = new ProfileCapturer();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureProfile') {
        capturer.captureProfile(request.siteType)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true; // Keep message channel open for async response
    }
});
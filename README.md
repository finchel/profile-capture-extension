# Profile Data Capture Extension

A Chrome extension for capturing LinkedIn profiles and Google Contacts data with full DOM information and screenshots.

## Features

- **LinkedIn Profile Capture**: Extract complete profile information from LinkedIn pages
- **Google Contacts Capture**: Capture contact details from Google Contacts
- **DOM Data Extraction**: Capture full page HTML and structured data
- **Screenshot Capability**: Take screenshots of profiles for visual reference
- **Data Export**: Export captured data in multiple formats (JSON, HTML, PDF)
- **Search and Filter**: Search through captured profiles and contacts

## Installation

1. Clone this repository:
```bash
git clone git@github.com:finchel/profile-capture-extension.git
cd profile-capture-extension
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to a LinkedIn profile or Google Contacts page
2. Click the extension icon in your browser toolbar
3. Choose your capture options:
   - Full HTML capture
   - Screenshot
   - Data export format
4. Click "Capture Profile" to save the data
5. View and manage captured profiles through the extension popup

## Files Structure

- `manifest.json` - Extension configuration and permissions
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and user interactions
- `content.js` - Content script for data extraction
- `background.js` - Background service worker for handling API calls and downloads
- `test_suite.md` - Test documentation and procedures

## Permissions

The extension requires the following permissions:
- **activeTab**: Access to the current tab's content
- **storage**: Store captured profile data
- **downloads**: Save captured data to files
- **scripting**: Inject scripts for data capture

## Supported Sites

- LinkedIn profiles (`https://www.linkedin.com/*`)
- Google Contacts (`https://contacts.google.com/*`)

## Development

To modify or enhance the extension:

1. Make your changes to the source files
2. Reload the extension in Chrome (`chrome://extensions/` → Click reload button)
3. Test the changes on supported sites

## Testing

See `test_suite.md` for comprehensive testing procedures and test cases.

## Privacy

This extension operates locally in your browser. Captured data is stored locally and is not transmitted to any external servers.

## License

This project is for personal use. Please respect the terms of service of the websites you're capturing data from.

## Contributing

Feel free to submit issues and enhancement requests!

## Author

Created by finchel
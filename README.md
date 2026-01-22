# OpenAI Logs Enhancer

A Chrome browser extension that adds useful columns and features to the OpenAI platform logs page.

## What It Does

This extension makes it easier to view and manage your OpenAI API logs. It adds new columns to the logs table and lets you show or hide columns as needed.

## Important Warning

**Note:** This extension extracts data by reading obfuscated CSS classes from the OpenAI platform. These class names may change at any time, which could cause the extension to stop working. There may be bugs and issues. Use at your own risk.

### Obfuscated CSS Classes Used

The extension relies on the following obfuscated CSS classes from the OpenAI platform:

- **`.O-gng`** - Header container (table header row)
- **`.nuDb6`** - Header cells (individual column headers)
- **`a[href^="/logs/"]`** - Row anchors (log entry rows)
- **`.D9q75`** - Row cells (individual cells in each row)
- **`div._38YGU`** - Filter bar root (where stats are injected)

These class names are subject to change without notice and may break the extension.

## Features

### Base Columns (Toggle On/Off)
- **Input** - Show or hide the input column
- **Output** - Show or hide the output column
- **Model** - Show or hide the model column
- **Created** - Show or hide the created date column

### New Columns Added
- **Usage** - Shows total tokens used. Hover to see breakdown (input tokens, output tokens, total)
- **ID** - Shows the request ID
- **Temperature** - Shows the temperature setting used
- **Presence Penalty** - Shows the presence penalty value
- **Frequency Penalty** - Shows the frequency penalty value
- **Metadata** - Shows metadata as chips. Hover to see full JSON

### Token Statistics
- **Average Token Display** - Shows average token usage in the filter bar
- **Averaging Options** - Choose between:
  - All loaded records (Note: Only calculates average of logs currently loaded on the page. To get average of all logs, scroll to the bottom first to load all logs)
  - Last 10 records
  - Last 30 records
- **Breakdown** - Displays average for:
  - Input tokens
  - Output tokens
  - Total tokens
  - Number of records (n=)

## Installation

### From Source

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing this extension
6. The extension is now installed!

## How to Use

1. Go to [platform.openai.com/logs](https://platform.openai.com/logs)
2. Click the extension icon in your Chrome toolbar
3. Use the toggles to show or hide columns
4. Changes apply immediately to the logs page

### Usage Column
- Shows total tokens in a pill format
- Hover over it to see detailed breakdown:
  - Input tokens
  - Output tokens
  - Total tokens

### Metadata Column
- Shows metadata as small chips
- Hover over chips to see the full JSON metadata

### Token Statistics
- Token averages appear automatically in the filter bar at the top of the logs page
- Use the dropdown to select averaging window (All, Last 10, or Last 30)
- **Important:** The "All" option only calculates the average of logs currently loaded on the page. To get the average of all your logs, first scroll to the bottom of the page to load all logs, then the "All" option will show the true average
- Statistics update automatically as more logs are loaded
- Shows average input tokens, output tokens, total tokens, and record count

## Settings

All settings are saved automatically. You can:
- Toggle any column on or off
- Click "Reset defaults" to restore original settings

## How It Works

The extension intercepts API responses that the OpenAI platform already makes to load log data. It does not make its own API requests. When you visit the logs page, the platform automatically fetches data from:

`https://api.openai.com/v1/dashboard/chat/completions?limit=100`

The extension captures these responses and extracts additional data (like usage, temperature, metadata, etc.) that is available in the API response but not displayed in the UI. This data is then shown in the new columns.

## Technical Details

- **Manifest Version**: 3
- **Permissions**: Storage, Scripting, Active Tab
- **Works on**: `https://platform.openai.com/logs*`
- **Data Source**: Intercepts responses from `https://api.openai.com/v1/dashboard/chat/completions`

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main script that runs on the logs page
- `popup.html/js/css` - Extension popup interface
- `inject.js` - Injected script for enhanced functionality
- `service_worker.js` - Background service worker

## License

This project is open source and available for use.

## Contributing

Feel free to submit issues or pull requests if you have ideas for improvements!

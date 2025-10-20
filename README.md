# eXamen - eBay Market Analyzer

A powerful eBay market analysis tool that scrapes active listings and provides detailed analytics for both new and used items.

## Features

- **Real-time eBay Scraping**: Extracts up to 100+ listings from eBay search results
- **Smart Pagination**: Automatically navigates through multiple pages to gather comprehensive data
- **Condition-based Analytics**: Separate analytics for New vs Used items
- **Price Analysis**: Average, highest, and lowest price calculations
- **Dark Mode Interface**: Modern, professional dark theme
- **Expandable Results**: Clean, organized display of search results

## Tech Stack

- **Backend**: Node.js with Express.js
- **Web Scraping**: Playwright (headless Chromium)
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Styling**: Custom CSS with dark mode theme

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open http://localhost:3000 in your browser

## Usage

1. Enter a search term (e.g., "iPhone 13", "MacBook Pro")
2. Click "GO" to start the analysis
3. View analytics for both New and Used items
4. Click "View Active Listings" to see detailed results

## Deployment

This application is ready for deployment on platforms like:
- Vercel
- Netlify
- Railway
- Heroku
- DigitalOcean App Platform

## License

MIT License

const form = document.getElementById('search-form');
const input = document.getElementById('q');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const resultsWrapper = document.getElementById('results-wrapper');
// Removed expand button - now using expandable list

let currentResults = [];
let showingAll = false;

function renderResults() {
  resultsEl.innerHTML = '';
  
  if (currentResults.length === 0) {
    resultsWrapper.style.display = 'none';
    return;
  }
  
  // Show the results container
  resultsWrapper.style.display = 'block';
  
  // Create analytics panels for New and Used items
  const newItems = currentResults.filter(item => item.condition && item.condition.toLowerCase().includes('new'));
  const usedItems = currentResults.filter(item => item.condition && item.condition.toLowerCase().includes('used'));
  
  // Create container for analytics panels
  const analyticsContainer = document.createElement('div');
  analyticsContainer.className = 'analytics-panels-container';
  
  // Add total results header (use the totalResults from the search response)
  const totalHeader = document.createElement('div');
  totalHeader.className = 'total-results-header';
  totalHeader.innerHTML = `
    <h2>Active Results: ${window.lastTotalResults || currentResults.length}</h2>
  `;
  analyticsContainer.appendChild(totalHeader);
  
  // Create panels container
  const panelsWrapper = document.createElement('div');
  panelsWrapper.className = 'panels-wrapper';
  
  if (newItems.length > 0) {
    const newAnalyticsPanel = createAnalyticsPanel(newItems, '');
    panelsWrapper.appendChild(newAnalyticsPanel);
  }
  
  if (usedItems.length > 0) {
    const usedAnalyticsPanel = createAnalyticsPanel(usedItems, '');
    panelsWrapper.appendChild(usedAnalyticsPanel);
  }
  
  analyticsContainer.appendChild(panelsWrapper);
  resultsEl.appendChild(analyticsContainer);
  
  // Create the expandable container
  const container = document.createElement('div');
  container.className = 'results-container';
  
  // Create the button
  const button = document.createElement('button');
  button.className = 'view-listings-btn';
  button.textContent = `View Active Listings (${currentResults.length})`;
  button.addEventListener('click', () => {
    if (showingAll) {
      hideResults();
    } else {
      showResults();
    }
  });
  
  // Create the results list (initially hidden)
  const resultsList = document.createElement('ul');
  resultsList.className = 'results-list';
  resultsList.style.display = 'none';
  
  // Populate the results list
  for (const item of currentResults) {
    const li = document.createElement('li');
    li.className = 'result-item';
    
    const titleLink = document.createElement('a');
    titleLink.href = item.url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.className = 'result-title';
    titleLink.textContent = item.title;
    
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const condition = item.condition ? item.condition : '';
    const price = item.price ? item.price : '';
    meta.innerHTML = `<span class="condition">${condition}</span> <span class="price">${price}</span>`;
    
    li.appendChild(titleLink);
    li.appendChild(meta);
    resultsList.appendChild(li);
  }
  
  container.appendChild(button);
  container.appendChild(resultsList);
  resultsEl.appendChild(container);
}

function createAnalyticsPanel(items, title) {
  const panel = document.createElement('div');
  panel.className = 'analytics-panel';
  
  // Calculate price statistics for the specific items
  const prices = items
    .map(item => item.price)
    .filter(price => price)
    .map(price => {
      // Extract numeric value from price string (e.g., "$123.45" -> 123.45)
      const match = price.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      return match ? parseFloat(match[1].replace(/,/g, '')) : null;
    })
    .filter(price => price !== null);
  
  const totalResults = items.length;
  const averagePrice = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
  const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
  
  // Determine if this is New or Used based on the items
  const isNew = items.length > 0 && items[0].condition && items[0].condition.toLowerCase().includes('new');
  const itemType = isNew ? 'New' : 'Used';
  
  panel.innerHTML = `
    <div class="analytics-content">
      <div class="analytics-item">
        <span class="analytics-label">${itemType}</span>
        <span class="analytics-value">${totalResults}</span>
      </div>
      <div class="analytics-item">
        <span class="analytics-label">Average Price</span>
        <span class="analytics-value">$${averagePrice.toFixed(2)}</span>
      </div>
      <div class="analytics-item">
        <span class="analytics-label">Highest Price</span>
        <span class="analytics-value">$${highestPrice.toFixed(2)}</span>
      </div>
      <div class="analytics-item">
        <span class="analytics-label">Lowest Price</span>
        <span class="analytics-value">$${lowestPrice.toFixed(2)}</span>
      </div>
    </div>
  `;
  
  return panel;
}

function showResults() {
  const resultsList = resultsEl.querySelector('.results-list');
  const button = resultsEl.querySelector('.view-listings-btn');
  
  if (resultsList && button) {
    resultsList.style.display = 'block';
    button.textContent = `Hide Listings (${currentResults.length})`;
    showingAll = true;
  }
}

function hideResults() {
  const resultsList = resultsEl.querySelector('.results-list');
  const button = resultsEl.querySelector('.view-listings-btn');
  
  if (resultsList && button) {
    resultsList.style.display = 'none';
    button.textContent = `View Active Listings (${currentResults.length})`;
    showingAll = false;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  showingAll = false;
  currentResults = [];
  renderResults();
  summaryEl.textContent = '';
  statusEl.textContent = 'Searching…';
  try {
    const res = await fetch(`/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    currentResults = data.results || [];
    window.lastTotalResults = data.totalResults; // Store the total results from backend
    summaryEl.textContent = ''; // Remove the total results display
    renderResults();
  } catch (err) {
    summaryEl.textContent = '';
    resultsEl.innerHTML = '';
    resultsWrapper.style.display = 'none';
    statusEl.textContent = 'Error fetching results';
    return;
  } finally {
    statusEl.textContent = '';
  }
});

expandBtn.addEventListener('click', () => {
  showingAll = !showingAll;
  renderResults();
});



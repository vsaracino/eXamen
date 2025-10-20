const form = document.getElementById('search-form');
const input = document.getElementById('q');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const resultsWrapper = document.getElementById('results-wrapper');
const soldResultsEl = document.getElementById('sold-results');
const soldResultsWrapper = document.getElementById('sold-results-wrapper');
const strWrapper = document.getElementById('str-wrapper');
const strContent = document.getElementById('str-content');
// Removed expand button - now using expandable list

let currentResults = [];
let currentSoldResults = [];
let showingAll = false;
let showingSoldAll = false;

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
  const usedItems = currentResults.filter(item => item.condition && (
    item.condition.toLowerCase().includes('used') || 
    item.condition.toLowerCase().includes('parts')
  ));
  
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
  
  // Always show both New and Used panels, even if count is 0
  const newAnalyticsPanel = createAnalyticsPanel(newItems, 'New');
  panelsWrapper.appendChild(newAnalyticsPanel);
  
  const usedAnalyticsPanel = createAnalyticsPanel(usedItems, 'Used');
  panelsWrapper.appendChild(usedAnalyticsPanel);
  
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
  
  // Use the passed title parameter to determine the card type
  const itemType = title || (items.length > 0 && items[0].condition && items[0].condition.toLowerCase().includes('new') ? 'New' : 'Used');
  
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

function renderSoldResults() {
  soldResultsEl.innerHTML = '';
  
  if (currentSoldResults.length === 0) {
    soldResultsWrapper.style.display = 'none';
    return;
  }
  
  // Show the sold results container
  soldResultsWrapper.style.display = 'block';
  
  // Create analytics panels for New and Used items
  const newItems = currentSoldResults.filter(item => item.condition && item.condition.toLowerCase().includes('new'));
  const usedItems = currentSoldResults.filter(item => item.condition && (
    item.condition.toLowerCase().includes('used') || 
    item.condition.toLowerCase().includes('parts')
  ));
  
  // Create container for analytics panels
  const analyticsContainer = document.createElement('div');
  analyticsContainer.className = 'analytics-panels-container';
  
  // Add total results header (use the totalResults from the search response)
  const totalHeader = document.createElement('div');
  totalHeader.className = 'total-results-header';
  totalHeader.innerHTML = `
    <h2>Sold Results: ${window.lastSoldTotalResults || currentSoldResults.length}</h2>
  `;
  analyticsContainer.appendChild(totalHeader);
  
  // Create panels container
  const panelsWrapper = document.createElement('div');
  panelsWrapper.className = 'panels-wrapper';
  
  // Always show both New and Used panels, even if count is 0
  const newAnalyticsPanel = createAnalyticsPanel(newItems, 'New');
  panelsWrapper.appendChild(newAnalyticsPanel);
  
  const usedAnalyticsPanel = createAnalyticsPanel(usedItems, 'Used');
  panelsWrapper.appendChild(usedAnalyticsPanel);
  
  analyticsContainer.appendChild(panelsWrapper);
  soldResultsEl.appendChild(analyticsContainer);
  
  // Create the expandable container
  const container = document.createElement('div');
  container.className = 'results-container';
  
  // Create the button
  const button = document.createElement('button');
  button.className = 'view-listings-btn';
  button.textContent = `View Sold Listings (${currentSoldResults.length})`;
  button.addEventListener('click', () => {
    if (showingSoldAll) {
      hideSoldResults();
    } else {
      showSoldResults();
    }
  });
  
  // Create the results list (initially hidden)
  const resultsList = document.createElement('ul');
  resultsList.className = 'results-list';
  resultsList.style.display = 'none';
  
  // Populate the results list
  for (const item of currentSoldResults) {
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
  soldResultsEl.appendChild(container);
}

function showSoldResults() {
  const resultsList = soldResultsEl.querySelector('.results-list');
  const button = soldResultsEl.querySelector('.view-listings-btn');
  
  if (resultsList && button) {
    resultsList.style.display = 'block';
    button.textContent = `Hide Sold Listings (${currentSoldResults.length})`;
    showingSoldAll = true;
  }
}

function hideSoldResults() {
  const resultsList = soldResultsEl.querySelector('.results-list');
  const button = soldResultsEl.querySelector('.view-listings-btn');
  
  if (resultsList && button) {
    resultsList.style.display = 'none';
    button.textContent = `View Sold Listings (${currentSoldResults.length})`;
    showingSoldAll = false;
  }
}

function renderSTR() {
  strContent.innerHTML = '';
  
  if (currentResults.length === 0 && currentSoldResults.length === 0) {
    strWrapper.style.display = 'none';
    return;
  }
  
  // Show the STR container
  strWrapper.style.display = 'block';
  
  // Calculate STR: Sold / Active * 100
  const activeCount = window.lastTotalResults || 0;
  const soldCount = window.lastSoldTotalResults || 0;
  const str = activeCount > 0 ? (soldCount / activeCount) * 100 : 0;
  
  // Determine color based on STR value
  let colorClass = '';
  if (str <= 20) {
    colorClass = 'str-red';
  } else if (str <= 35) {
    colorClass = 'str-orange';
  } else if (str <= 50) {
    colorClass = 'str-yellow';
  } else if (str < 100) {
    colorClass = 'str-green';
  } else {
    colorClass = 'str-rainbow';
  }
  
  strContent.innerHTML = `
    <div class="str-header">
      <h2>Sellthrough Rate</h2>
    </div>
    <div class="str-content">
      <div class="str-value ${colorClass}">
        ${str.toFixed(1)}%
      </div>
      <div class="str-calculation">
        ${soldCount} sold ÷ ${activeCount} active
      </div>
    </div>
  `;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  showingAll = false;
  showingSoldAll = false;
  currentResults = [];
  currentSoldResults = [];
  renderResults();
  renderSoldResults();
  renderSTR();
  summaryEl.textContent = '';
  statusEl.textContent = 'Analyzing listings... This may take up to 30 seconds';
  
  try {
    // Search both active and sold listings in parallel
    const [activeRes, soldRes] = await Promise.all([
      fetch(`/search?q=${encodeURIComponent(q)}`),
      fetch(`/search-sold?q=${encodeURIComponent(q)}`)
    ]);
    
    if (!activeRes.ok) throw new Error('Active search failed');
    if (!soldRes.ok) throw new Error('Sold search failed');
    
    const [activeData, soldData] = await Promise.all([
      activeRes.json(),
      soldRes.json()
    ]);
    
    currentResults = activeData.results || [];
    currentSoldResults = soldData.results || [];
    window.lastTotalResults = activeData.totalResults; // Store the total results from backend
    window.lastSoldTotalResults = soldData.totalResults; // Store the sold total results from backend
    summaryEl.textContent = ''; // Remove the total results display
    renderResults();
    renderSoldResults();
    renderSTR();
  } catch (err) {
    summaryEl.textContent = '';
    resultsEl.innerHTML = '';
    soldResultsEl.innerHTML = '';
    strContent.innerHTML = '';
    resultsWrapper.style.display = 'none';
    soldResultsWrapper.style.display = 'none';
    strWrapper.style.display = 'none';
    statusEl.textContent = 'Error fetching results';
    return;
  } finally {
    statusEl.textContent = '';
  }
});




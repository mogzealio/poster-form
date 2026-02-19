(function() {
    'use strict';
    
    console.log('Script started...');
    
    // Load Fuse.js if not already loaded
    function loadFuse(callback) {
        if (typeof Fuse !== 'undefined') {
            console.log('Fuse.js already loaded');
            callback();
            return;
        }
        
        console.log('Loading Fuse.js...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.0.0/fuse.min.js';
        script.onload = function() {
            console.log('Fuse.js loaded');
            callback();
        };
        script.onerror = function() {
            console.error('Failed to load Fuse.js');
        };
        document.head.appendChild(script);
    }
    
    // Main initialization function
    function init() {
        console.log('Poster form initializing...');

        // Check if our HTML elements exist
        const container = document.querySelector('.poster-form-container');
        if (!container) {
            console.error('Form container not found! Retrying...');
            setTimeout(init, 100);
            return;
        }

        console.log('Form container found!');

        // Check if user came back from Stripe checkout
        const urlHash = window.location.hash;
        const checkoutSuccessful = urlHash === '#success';

        // Check for URL parameters from preview email (e.g., ?townland=xxx&size=xxx&color=xxx)
        const urlParams = new URLSearchParams(window.location.search);
        const fromPreviewEmail = urlParams.has('townland') && urlParams.has('size') && urlParams.has('color');

        // Capture location parameter for physical store tracking (e.g., ?location=store1)
        const locationParam = urlParams.get('location');
        if (locationParam) {
            console.log('Location parameter detected:', locationParam);
            localStorage.setItem('referral_location', locationParam);
        }

        // Check if we should restore cart (at #buy-poster with saved cart data)
        const savedCart = localStorage.getItem('posterCart');
        const atFormSection = urlHash === '#buy-poster';
        const returningFromCheckout = atFormSection && savedCart !== null;
        
        // ============================================
        // CONFIGURATION - UPDATE THESE VALUES
        // ============================================
        
        const CONFIG = {
            workerUrl: 'https://poster-checkout.jack-7a4.workers.dev',
            successUrl: window.location.origin + '/#success',
            cancelUrl: window.location.origin + '/#buy-poster',

            // Prices for display (should match your Stripe prices)
            prices: {
                eur: {
                    standard: { small: 30, medium: 35, large: 45 },
                    custom: { small: 35, medium: 45, large: 55 },
                    cluster: { small: 35, medium: 45, large: 55 }
                },
                gbp: {
                    standard: { small: 26, medium: 30, large: 38 },
                    custom: { small: 30, medium: 38, large: 47 },
                    cluster: { small: 30, medium: 38, large: 47 }
                },
                usd: {
                    standard: { small: 33, medium: 38, large: 50 },
                    custom: { small: 38, medium: 50, large: 60 },
                    cluster: { small: 38, medium: 50, large: 60 }
                },
                aud: {
                    standard: { small: 69, medium: 88, large: 100 },
                    custom: { small: 80, medium: 113, large: 122 },
                    cluster: { small: 80, medium: 113, large: 122 }
                }
            },

            // Currency symbols
            currencySymbols: {
                eur: '€',
                gbp: '£',
                usd: '$',
                aud: '$'
            },

            // Frame prices (size-dependent, EUR only for now)
            framePrices: {
                eur: {
                    small: {  // A3
                        none: 0,
                        white: 65,
                        black: 65,
                        oak: 65
                    },
                    medium: {  // A2
                        none: 0,
                        white: 90,
                        black: 90,
                        oak: 90
                    },
                    large: {  // A1
                        none: 0,
                        white: 125,
                        black: 125,
                        oak: 125
                    }
                }
            }
        };
    
    // ============================================
    // STATE MANAGEMENT
    // ============================================
    
    const formState = {
        currentStep: 1,
        productType: null, // 'standard' or 'custom'
        locationType: null, // 'eircode' or 'townland'
        locationValue: null, // NOW stores the townland ID!
        townlandDisplay: null, // For showing to customer
        size: null, // 'small', 'medium', 'large'
        color: null, // 'blue', 'green', 'red'
        frame: null, // 'none', 'white', 'black', 'oak', 'premium_oak'
        markerLon: null, // Eircode longitude (for cluster marker)
        markerLat: null, // Eircode latitude (for cluster marker)
        shippingCountry: null, // 'IE', 'GB', 'EU', 'US', 'CA', 'AU'
        currency: 'eur' // 'eur', 'gbp', 'usd', 'aud' - defaults to EUR
    };

    /**
     * Get currency based on shipping country/region
     */
    function getCurrencyForCountry(countryCode) {
        if (!countryCode) return 'eur';
        const code = countryCode.toUpperCase();
        if (code === 'IE' || code === 'EU') return 'eur';
        if (code === 'GB') return 'gbp';
        if (code === 'US' || code === 'CA') return 'usd';
        if (code === 'AU') return 'aud';
        return 'eur';
    }

    /**
     * Format price with currency symbol
     */
    function formatPrice(amount, currency = 'eur') {
        const symbol = CONFIG.currencySymbols[currency] || '€';
        return `${symbol}${amount}`;
    }

    /**
     * Update all price displays on the page to match current currency
     */
    function updatePriceDisplays() {
        const currency = formState.currency;

        // Update carousel price on step 1
        const carouselEl = document.querySelector('.carousel');
        if (carouselEl && typeof currentSlide !== 'undefined' && typeof carouselSlides !== 'undefined') {
            const slide = carouselSlides[currentSlide];
            const price = CONFIG.prices[currency][slide.product].small;
            const priceEl = carouselEl.querySelector('.carousel-price');
            if (priceEl) {
                priceEl.textContent = `From ${formatPrice(price, currency)} + postage`;
            }
        }

        // Update price display on step 3 if size is selected
        if (formState.size && formState.productType) {
            const priceDisplay = document.querySelector('#priceDisplay .amount');
            if (priceDisplay) {
                const price = CONFIG.prices[currency][formState.productType][formState.size];
                priceDisplay.textContent = formatPrice(price, currency);
            }
        }
    }

    // Cart state for multi-poster checkout
    const cart = {
        items: [],

        addItem(item) {
            this.items.push(item);
            this.updateUI();
            console.log('Added to cart:', item);
            console.log('Cart now has', this.items.length, 'items');
        },

        removeItem(index) {
            this.items.splice(index, 1);
            this.updateUI();
            console.log('Removed item at index', index);
            console.log('Cart now has', this.items.length, 'items');
        },

        clear() {
            this.items = [];
            this.updateUI();
            console.log('Cart cleared');
        },

        getTotalPrice() {
            const currency = formState.currency;
            return this.items.reduce((total, item) => {
                const price = CONFIG.prices[currency][item.productType][item.size];
                // Add frame price if applicable
                let framePrice = 0;
                if (item.frame && item.frame !== 'none' && CONFIG.framePrices[currency]) {
                    framePrice = CONFIG.framePrices[currency][item.size][item.frame] || 0;
                }
                return total + price + framePrice;
            }, 0);
        },

        updateUI() {
            const currency = formState.currency;

            // Update cart items display
            const cartItems = document.getElementById('cartItems');
            if (cartItems) {
                cartItems.innerHTML = this.items.map((item, index) => {
                    const price = CONFIG.prices[currency][item.productType][item.size];

                    // Add frame price if applicable
                    let framePrice = 0;
                    if (item.frame && item.frame !== 'none' && CONFIG.framePrices[currency]) {
                        framePrice = CONFIG.framePrices[currency][item.size][item.frame] || 0;
                    }

                    const totalPrice = price + framePrice;
                    const sizeLabel = {small: 'A3', medium: 'A2', large: 'A1'}[item.size];
                    const typeLabel = {custom: 'Custom', cluster: 'Cluster', standard: 'Standard'}[item.productType] || 'Standard';
                    const location = item.townlandDisplay ? ` - ${item.townlandDisplay}` : '';

                    // Format frame name for display
                    const frameNames = {
                        white: 'Lime White Frame',
                        black: 'Charcoal Black Frame',
                        oak: 'Natural Oak Frame'
                    };
                    const frameLabel = (item.frame && item.frame !== 'none') ? ` + ${frameNames[item.frame]}` : '';

                    return `
                        <div class="cart-item">
                            <div class="cart-item-details">
                                <strong>${typeLabel} ${sizeLabel}</strong>
                                <div class="cart-item-meta">${item.color}${location}${frameLabel}</div>
                            </div>
                            <div class="cart-item-price">${formatPrice(totalPrice, currency)}</div>
                            <button type="button" class="cart-item-remove" data-index="${index}">✕</button>
                        </div>
                    `;
                }).join('');

                // Add remove handlers
                document.querySelectorAll('.cart-item-remove').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const index = parseInt(this.dataset.index);
                        cart.removeItem(index);
                    });
                });
            }

            // Update cart total
            const cartTotal = document.getElementById('cartTotal');
            if (cartTotal) {
                cartTotal.textContent = formatPrice(this.getTotalPrice(), currency);
            }
        }
    };
    
    // ============================================
    // LOCATION DATA - Loaded from External File
    // ============================================
    
    // UPDATE THIS URL to point to your hosted locations.json file
    const LOCATIONS_JSON_URL = 'https://pub-ddc543ba1c324125b2264e2dc4f23293.r2.dev/townland_locations_with_ids_irish.json?v=1';

    let locations = [];
    let fuse = null;
    let locationsLoaded = false;
    let locationsLoadingStarted = false;

    // Load locations from external JSON file (NEW FORMAT with IDs)
    async function loadLocations() {
        if (locationsLoadingStarted) return; // Prevent duplicate loads
        locationsLoadingStarted = true;

        try {
            console.log('Starting to load locations data...');
            const response = await fetch(LOCATIONS_JSON_URL);
            if (!response.ok) {
                throw new Error('Failed to load locations');
            }

            locations = await response.json();

            // NEW: Locations are now objects with id, name, display, etc.
            // Example: { id: "level10_stoops_a1b2", name: "Stoops", display: "Stoops, Shillelagh, Co. Wicklow" }

            // Initialize Fuse.js for fuzzy search (search by name, Irish name, and full display)
            fuse = new Fuse(locations, {
                threshold: 0.3,
                keys: ['name', 'name_ga', 'display'] // Search by English name, Irish name, and full display
            });

            locationsLoaded = true;
            console.log(`Loaded ${locations.length} locations with IDs`);

            // Enable eircode input now that data is ready
            updateEircodeInputState();

        } catch (error) {
            console.error('Error loading locations:', error);
            alert('Failed to load townland data. Please refresh the page.');
        }
    }

    // Update eircode input state based on loading status
    function updateEircodeInputState() {
        const eircodeInput = document.getElementById('eircodeInput');
        if (!eircodeInput) return;

        // Get or create loading message element
        let loadingMessage = document.getElementById('eircodeLoadingMessage');

        if (locationsLoaded) {
            eircodeInput.disabled = false;
            eircodeInput.placeholder = 'Enter your Eircode (e.g., A65 F4E2)';
            eircodeInput.style.opacity = '1';

            // Hide loading message
            if (loadingMessage) {
                loadingMessage.style.display = 'none';
            }
        } else {
            eircodeInput.disabled = true;
            eircodeInput.placeholder = 'Loading location data...';
            eircodeInput.style.opacity = '0.6';

            // Create and show loading message with animated ellipsis
            if (!loadingMessage) {
                loadingMessage = document.createElement('div');
                loadingMessage.id = 'eircodeLoadingMessage';
                loadingMessage.style.cssText = `
                    margin-top: 8px;
                    padding: 8px 12px;
                    background: rgba(90, 111, 100, 0.1);
                    border: 1px solid #5a6f64;
                    border-radius: 4px;
                    color: #B8B8A8;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                loadingMessage.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" style="animation: spin 1s linear infinite;">
                        <circle cx="8" cy="8" r="6" fill="none" stroke="#7fb069" stroke-width="2" stroke-dasharray="10 20" />
                    </svg>
                    <span>Loading townland database<span class="loading-dots"></span></span>
                    <style>
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        @keyframes dots {
                            0%, 20% { content: ''; }
                            40% { content: '.'; }
                            60% { content: '..'; }
                            80%, 100% { content: '...'; }
                        }
                        .loading-dots::after {
                            content: '';
                            animation: dots 1.5s steps(1, end) infinite;
                        }
                    </style>
                `;

                // Insert after the eircode input
                eircodeInput.parentNode.insertBefore(loadingMessage, eircodeInput.nextSibling);
            } else {
                loadingMessage.style.display = 'flex';
            }
        }
    }

    // Load locations when page loads
    loadLocations();

    // ============================================
    // GOOGLE GEOCODING API - EIRCODE LOOKUP
    // ============================================

    /**
     * Calculate distance between two lat/lng points using Haversine formula
     * Returns distance in kilometers
     */
    function calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    async function lookupEircodeViaGoogle(eircode, retryCount = 0) {
        /**
         * Look up eircode via backend proxy (secure - API key hidden).
         * Returns townland suggestion from Google's data.
         * Now includes distance filtering to avoid false matches.
         * Includes automatic retry if locations aren't loaded yet.
         */
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1000; // 1 second between retries

        try {
            // Check for locations loaded FIRST (before calling API)
            if (!locationsLoaded || locations.length === 0) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`Locations not loaded yet, retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    return lookupEircodeViaGoogle(eircode, retryCount + 1);
                } else {
                    console.warn('Locations still not loaded after retries');
                    return { error: 'still_loading', message: 'Location data is still loading. Please try again in a moment.' };
                }
            }

            // Call our backend worker (not Google directly!)
            // Add timeout to handle slow API responses (Cloudflare Worker cold starts)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            let response;
            try {
                response = await fetch(`${CONFIG.workerUrl}/lookup-eircode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ eircode }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn('Backend lookup failed:', response.status);
                    return null;
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.warn('Eircode lookup timed out after 10 seconds');
                    return { error: 'timeout', message: 'The lookup request timed out. Please try again.' };
                }
                throw fetchError;
            }

            const data = await response.json();

            if (data.status !== 'OK') {
                console.warn('Google API returned:', data.status);
                return null;
            }

            const result = data.results[0];

            // Extract coordinates from Google's geocoded location
            const googleLat = result.geometry.location.lat;
            const googleLng = result.geometry.location.lng;
            console.log('Google geocoded to:', googleLat, googleLng);

            // Extract townland from 'neighborhood' or 'locality' component
            const townlandComponent = result.address_components.find(c =>
                c.types.includes('neighborhood') || c.types.includes('locality')
            );

            if (!townlandComponent) {
                console.warn('No townland found in Google response');
                return null;
            }

            const googleTownland = townlandComponent.long_name;
            console.log('Google suggested townland:', googleTownland);

            const MAX_DISTANCE_KM = 25;

            // Step 1: Try EXACT name match within radius (case-insensitive)
            const exactMatches = locations.filter(loc => {
                if (!loc.lat || !loc.lng) return false;

                const distance = calculateDistance(googleLat, googleLng, loc.lat, loc.lng);
                if (distance > MAX_DISTANCE_KM) return false;

                // Check exact match (case-insensitive)
                return loc.name.toLowerCase() === googleTownland.toLowerCase();
            });

            if (exactMatches.length > 0) {
                // Sort by distance and return closest exact match
                exactMatches.sort((a, b) => {
                    const distA = calculateDistance(googleLat, googleLng, a.lat, a.lng);
                    const distB = calculateDistance(googleLat, googleLng, b.lat, b.lng);
                    return distA - distB;
                });

                const closest = exactMatches[0];
                const distance = calculateDistance(googleLat, googleLng, closest.lat, closest.lng);
                console.log(`Exact match found: ${closest.display} (${distance.toFixed(1)}km away)`);

                return {
                    suggested: closest,
                    googleName: googleTownland,
                    allMatches: exactMatches.slice(0, 5).map(loc => ({ item: loc })),
                    distance: distance,
                    matchType: 'exact', // Exact name match
                    googleLat: googleLat,
                    googleLng: googleLng
                };
            }

            // Step 2: No exact match - fallback to pure geographic search
            console.log(`No exact match for "${googleTownland}", searching by location only...`);

            if (!locationsLoaded || locations.length === 0) {
                console.warn('Locations not loaded for geographic search');
                return null;
            }

            // Find all townlands within radius, sorted by distance
            const allNearby = locations
                .map(loc => ({
                    location: loc,
                    distance: calculateDistance(googleLat, googleLng, loc.lat, loc.lng)
                }))
                .filter(item => item.distance <= MAX_DISTANCE_KM)
                .sort((a, b) => a.distance - b.distance);

            if (allNearby.length > 0) {
                const nearest = allNearby[0];
                console.log(`Found nearest townland: ${nearest.location.display} (${nearest.distance.toFixed(1)}km away)`);

                return {
                    suggested: nearest.location,
                    googleName: googleTownland,
                    allMatches: allNearby.slice(0, 5).map(item => ({ item: item.location })),
                    distance: nearest.distance,
                    matchType: 'geographic', // Matched by location only
                    googleLat: googleLat,
                    googleLng: googleLng
                };
            }

            console.warn(`No townlands found within ${MAX_DISTANCE_KM}km of coordinates`);
            return null;

        } catch (error) {
            console.error('Eircode lookup failed:', error);
            return null;
        }
    }

    async function showTownlandSuggestion(eircode) {
        /**
         * Look up eircode and show suggestion to customer.
         * Now handles retry logic and better error messages.
         */
        const suggestionDiv = document.getElementById('townlandSuggestion');
        if (!suggestionDiv) {
            console.error('townlandSuggestion div not found in HTML!');
            return;
        }

        suggestionDiv.innerHTML = '<div class="loading">🔍 Looking up your townland...</div>';
        suggestionDiv.classList.add('active');

        const result = await lookupEircodeViaGoogle(eircode);

        // Handle "still loading" error
        if (result && result.error === 'still_loading') {
            suggestionDiv.innerHTML = `
                <div class="suggestion-warning">
                    <p>⏳ ${result.message}</p>
                    <p>The location database is still loading. Please wait a few seconds and your eircode will be looked up automatically.</p>
                </div>
            `;
            return;
        }

        // Handle timeout error
        if (result && result.error === 'timeout') {
            suggestionDiv.innerHTML = `
                <div class="suggestion-warning">
                    <p>⏱️ ${result.message}</p>
                    <p>This can happen if the service is warming up. Please try entering your eircode again.</p>
                    <button type="button" class="btn btn-change">Try Again</button>
                </div>
            `;

            suggestionDiv.querySelector('.btn-change').addEventListener('click', function() {
                suggestionDiv.classList.remove('active');
                // Clear the input so user can re-enter
                const eircodeInput = document.getElementById('eircodeInput');
                eircodeInput.focus();
            });
            return;
        }

        if (result && result.suggested) {
            const location = result.suggested;
            const matchType = result.matchType;
            const distanceText = result.distance ? ` (${result.distance.toFixed(1)}km away)` : '';

            // Different messaging based on match type
            let label, townlandText;
            if (matchType === 'exact') {
                // Exact name match - high confidence
                label = 'We think this is your townland:';
                townlandText = `<strong>${location.display}</strong>`;
            } else if (matchType === 'geographic') {
                // Geographic fallback - show distance
                label = 'We found the nearest townland to your location:';
                townlandText = `<strong>${location.display}</strong>${distanceText}`;
            } else {
                // Fallback for any other case
                label = 'We think this is your townland:';
                townlandText = `<strong>${location.display}</strong>`;
            }

            suggestionDiv.innerHTML = `
                <div class="suggestion-box">
                    <p class="suggestion-label">${label}</p>
                    <p class="suggestion-townland">${townlandText}</p>
                    <div class="suggestion-buttons">
                        <button type="button" class="btn btn-confirm" data-location-id="${location.id}">
                            ✓ That's correct
                        </button>
                        <button type="button" class="btn btn-change">
                            ✗ No, let me search
                        </button>
                    </div>
                </div>
            `;

            // Handle confirmation
            suggestionDiv.querySelector('.btn-confirm').addEventListener('click', function() {
                // Store the townland ID (this is the key!)
                formState.locationType = 'townland';
                formState.locationValue = location.id; // Custom ID for backend!
                formState.townlandDisplay = location.display; // For display

                // Capture eircode coords for cluster marker
                if (result.googleLat !== undefined && result.googleLng !== undefined) {
                    formState.markerLat = result.googleLat;
                    formState.markerLon = result.googleLng;
                }

                console.log('Customer confirmed townland:', location.id);

                updateStep2Button();
                suggestionDiv.classList.remove('active');

                // Visual feedback
                const eircodeInput = document.getElementById('eircodeInput');
                eircodeInput.style.borderColor = '#28a745';
                setTimeout(() => eircodeInput.style.borderColor = '', 2000);
            });

            // Handle manual search
            suggestionDiv.querySelector('.btn-change').addEventListener('click', function() {
                suggestionDiv.classList.remove('active');
                // Switch to address search tab
                document.querySelector('.location-tab[data-tab="address"]').click();
            });

        } else {
            suggestionDiv.innerHTML = `
                <div class="suggestion-warning">
                    <p>⚠️ Could not automatically find your townland.</p>
                    <p>Please search manually using the "Search Townlands" tab.</p>
                    <button type="button" class="btn btn-change">Search Manually</button>
                </div>
            `;

            suggestionDiv.querySelector('.btn-change').addEventListener('click', function() {
                suggestionDiv.classList.remove('active');
                document.querySelector('.location-tab[data-tab="address"]').click();
            });
        }
    }

    // ============================================
    // STEP NAVIGATION
    // ============================================
    
    function goToStep(step) {
        // Hide all steps
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));

        // Show target step
        document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');

        // Update progress bar
        document.querySelectorAll('.progress-step').forEach((ps, index) => {
            const stepNum = index + 1;
            ps.classList.remove('active', 'completed');

            if (stepNum < step) {
                ps.classList.add('completed');
            } else if (stepNum === step) {
                ps.classList.add('active');
            }
        });

        formState.currentStep = step;

        // Pre-select defaults when reaching step 3
        if (step === 3) {
            // Pre-select medium size if nothing selected
            if (!formState.size) {
                formState.size = 'medium';
                const mediumOption = document.querySelector('[data-size="medium"]');
                if (mediumOption) {
                    mediumOption.classList.add('selected');
                }
            }

            // Pre-select green color if nothing selected
            if (!formState.color) {
                formState.color = 'green';
                const greenOption = document.querySelector('[data-color="green"]');
                if (greenOption) {
                    greenOption.classList.add('selected');
                }
                updateColorPreview('green');
            }

            // Update price display and button state
            updatePriceDisplay();
            updateStep3Button();

            // Show preview button for custom posters
            const toggleBtn = document.getElementById('togglePreviewBtn');
            if (toggleBtn) {
                toggleBtn.style.display = (formState.productType === 'custom' || formState.productType === 'cluster') ? 'inline-block' : 'none';
            }
        } else if (step === 4) {
            // Initialize step 4 - framing
            // Update frame price displays based on selected size
            updateFramePriceDisplays();

            // Pre-select "none" if nothing selected
            if (!formState.frame) {
                formState.frame = 'none';
                const noneOption = document.querySelector('[data-frame="none"]');
                if (noneOption) {
                    noneOption.classList.add('selected');
                }
                updateFramePreview('none');
            }

            // Update price breakdown
            updatePriceBreakdown();
            updateStep4Button();
        } else {
            // Hide preview button when not on step 3
            const toggleBtn = document.getElementById('togglePreviewBtn');
            if (toggleBtn) {
                toggleBtn.style.display = 'none';
            }

            // Hide preview section when leaving step 3
            const prevSection = document.getElementById('previewSection');
            if (prevSection) {
                prevSection.style.display = 'none';
            }
        }

        // Scroll to the form container (not page top)
        const container = document.querySelector('.poster-form-container');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    // ============================================
    // STEP 1: PRODUCT TYPE (Carousel)
    // ============================================

    const carouselSlides = [
        {
            product: 'custom',
            title: 'Your Townland on a Map',
            description: 'Your townland highlighted among all of Ireland\'s 61,000+ townlands. Three sizes and four colour options.',
            image: 'https://mogzealio.github.io/poster-form/images/framed_into_image_custom.png'
        },
        {
            product: 'cluster',
            title: 'Your Townland & Its Neighbours',
            description: 'Just your townland and its neighbours, optionally showing your home location. Three sizes and four colour options.',
            image: 'https://mogzealio.github.io/poster-form/images/framed_into_image_cluster.png'
        },
        {
            product: 'standard',
            title: 'Standard townland map',
            description: 'Ireland\'s 61,000+ townlands without highlighting any particular one. Three sizes and four colour options.',
            image: 'https://mogzealio.github.io/poster-form/images/framed_into_image_standard.png'
        }
    ];

    let currentSlide = 0;

    function showCarouselSlide() {
        const slide = carouselSlides[currentSlide];
        const carousel = document.querySelector('.carousel');
        carousel.querySelector('.carousel-image').src = slide.image;
        carousel.querySelector('.carousel-title').textContent = slide.title;
        carousel.querySelector('.carousel-description').textContent = slide.description;
        const currency = formState.currency;
        carousel.querySelector('.carousel-price').textContent =
            `From ${formatPrice(CONFIG.prices[currency][slide.product].small, currency)} + postage`;
        carousel.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === currentSlide);
        });
    }

    function selectCarouselSlide() {
        showCarouselSlide();
        const carousel = document.querySelector('.carousel');
        carousel.classList.add('selected');
        formState.productType = carouselSlides[currentSlide].product;
        document.getElementById('step1Next').disabled = false;
    }

    // Initialize carousel
    (function initCarousel() {
        const dotsContainer = document.querySelector('.carousel-dots');
        if (!dotsContainer) return;

        carouselSlides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSlide = i;
                selectCarouselSlide();
            });
            dotsContainer.appendChild(dot);
        });

        // Arrow handlers
        const leftArrow = document.querySelector('.carousel-arrow-left');
        const rightArrow = document.querySelector('.carousel-arrow-right');
        if (leftArrow) {
            leftArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSlide = (currentSlide - 1 + carouselSlides.length) % carouselSlides.length;
                selectCarouselSlide();
            });
        }
        if (rightArrow) {
            rightArrow.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSlide = (currentSlide + 1) % carouselSlides.length;
                selectCarouselSlide();
            });
        }

        // Clicking carousel body selects current slide
        const carousel = document.querySelector('.carousel');
        if (carousel) {
            carousel.addEventListener('click', () => {
                selectCarouselSlide();
            });
        }

        // Show and select first slide
        selectCarouselSlide();
    })();

    document.getElementById('step1Next').addEventListener('click', () => {
        if (formState.productType === 'custom' || formState.productType === 'cluster') {
            goToStep(2);
        } else {
            goToStep(3);
        }
    });
    
    // ============================================
    // STEP 2: LOCATION (Custom only)
    // ============================================
    
    // Location tabs
    document.querySelectorAll('.location-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabType = this.dataset.tab;
            
            // Switch tabs
            document.querySelectorAll('.location-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Switch input containers
            document.querySelectorAll('.location-input-container').forEach(c => c.classList.remove('active'));
            document.querySelector(`.location-input-container[data-tab="${tabType}"]`).classList.add('active');
            
            // Update state
            formState.locationType = tabType;
            formState.locationValue = null;
            formState.townlandDisplay = null;

            // Clear inputs
            document.getElementById('eircodeInput').value = '';
            document.getElementById('addressInput').value = '';
            document.getElementById('autocompleteResults').classList.remove('active');
            document.getElementById('townlandSuggestion').classList.remove('active');

            updateStep2Button();
        });
    });
    
    // Eircode input - AUTO LOOKUP when complete
    const eircodeInput = document.getElementById('eircodeInput');

    // Set initial loading state
    updateEircodeInputState();

    eircodeInput.addEventListener('input', function(e) {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Format as A65 F4E2
        if (value.length > 3) {
            value = value.slice(0, 3) + ' ' + value.slice(3, 7);
        }

        this.value = value;

        // Auto-lookup when eircode is complete (only if locations are loaded)
        if (value.replace(/\s/g, '').length === 7) {
            if (locationsLoaded) {
                showTownlandSuggestion(value);
            } else {
                // Show loading message if locations aren't ready yet
                const suggestionDiv = document.getElementById('townlandSuggestion');
                if (suggestionDiv) {
                    suggestionDiv.innerHTML = `
                        <div class="suggestion-warning">
                            <p>⏳ Loading location data...</p>
                            <p>Please wait a moment while we load the townland database. Your eircode will be looked up automatically once ready.</p>
                        </div>
                    `;
                    suggestionDiv.classList.add('active');
                }
                // Retry lookup after locations load
                const checkInterval = setInterval(() => {
                    if (locationsLoaded) {
                        clearInterval(checkInterval);
                        // Re-trigger lookup if eircode is still complete
                        const currentValue = eircodeInput.value.replace(/\s/g, '');
                        if (currentValue.length === 7) {
                            showTownlandSuggestion(eircodeInput.value);
                        }
                    }
                }, 500);
            }
        } else {
            // Clear suggestion if editing
            const suggestionDiv = document.getElementById('townlandSuggestion');
            if (suggestionDiv) {
                suggestionDiv.classList.remove('active');
            }
            formState.locationValue = null;
            formState.townlandDisplay = null;
            updateStep2Button();
        }
    });
    
    // Address autocomplete
    let selectedIndex = -1;
    let currentResults = [];
    let searchTimeout = null;  // For debouncing search

    document.getElementById('addressInput').addEventListener('input', function(e) {
        const query = e.target.value.trim();
        const resultsDiv = document.getElementById('autocompleteResults');

        // Clear any existing timeout
        clearTimeout(searchTimeout);

        // Check if locations are loaded
        if (!locationsLoaded || !fuse) {
            resultsDiv.innerHTML = '<div class="autocomplete-item">Loading locations...</div>';
            resultsDiv.classList.add('active');
            return;
        }

        if (query.length < 2) {
            resultsDiv.classList.remove('active');
            formState.locationValue = null;
            formState.townlandDisplay = null;
            updateStep2Button();
            return;
        }

        // Debounce search - wait 200ms after user stops typing
        searchTimeout = setTimeout(() => {
            // Search locations (now searches by name, Irish name, and display)
            const searchResults = fuse.search(query);
            currentResults = searchResults.slice(0, 100);  // Increased from 10 to handle duplicate names (e.g., 244 "Glebe"s)

            if (currentResults.length === 0) {
                resultsDiv.innerHTML = '<div class="autocomplete-item">No locations found</div>';
                resultsDiv.classList.add('active');
                formState.locationValue = null;
                formState.townlandDisplay = null;
                updateStep2Button();
                return;
            }

            // Display results using 'display' property and Irish name if available
            const html = currentResults.map((result, index) => {
                const location = result.item;
                const parts = location.display.split(',');
                const locationName = parts[0].trim();
                const details = parts.slice(1).join(',').trim();
                const irishName = location.name_ga;

                // Show Irish name in smaller font if available
                const irishNameHtml = irishName ? `<div class="location-irish">${irishName}</div>` : '';

                return `
                    <div class="autocomplete-item" data-index="${index}">
                        <strong>${locationName}</strong>
                        ${irishNameHtml}
                        <div class="location-detail">${details}</div>
                    </div>
                `;
            }).join('');

            resultsDiv.innerHTML = html;
            resultsDiv.classList.add('active');
            selectedIndex = -1;
        
            // Add click handlers
            document.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', function() {
                    const index = parseInt(this.dataset.index);
                    if (!isNaN(index)) {
                        selectLocation(currentResults[index].item); // Pass full object
                    }
                });
            });
        }, 200);  // 200ms debounce delay
    });

    function selectLocation(location) {
        /**
         * CHANGED: Now stores location.id instead of display string
         */
        document.getElementById('addressInput').value = location.display;
        document.getElementById('autocompleteResults').classList.remove('active');

        formState.locationType = 'townland';
        formState.locationValue = location.id; // Store ID!
        formState.townlandDisplay = location.display; // For display

        console.log('Customer selected townland:', location.id);

        updateStep2Button();
    }
    
    function updateStep2Button() {
        /**
         * UPDATED: Simply check if we have a townland ID
         * The ID is set when customer confirms Google suggestion or selects manually
         */
        const btn = document.getElementById('step2Next');
        btn.disabled = !formState.locationValue; // Enable if we have a townland ID
    }
    
    document.getElementById('step2Back').addEventListener('click', () => goToStep(1));
    document.getElementById('step2Next').addEventListener('click', () => goToStep(3));
    
    // ============================================
    // STEP 3: SIZE & COLOR
    // ============================================
    
    // Size selection
    document.querySelectorAll('.size-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            formState.size = this.dataset.size;
            updatePriceDisplay();
            updateStep3Button();
        });
    });
    
    // Color selection with preview - different images for standard vs custom
    const colorPreviewImages = {
        standard: {
            'default': 'https://mogzealio.github.io/poster-form/images/standard-sailboat-preview.jpg',
            'green': 'https://mogzealio.github.io/poster-form/images/standard-mossy-preview.jpg',
            'rhubarb': 'https://mogzealio.github.io/poster-form/images/standard-rhubarb-preview.jpg',
            'slate': 'https://mogzealio.github.io/poster-form/images/standard-slate-preview.jpg'
        },
        custom: {
            'default': 'https://mogzealio.github.io/poster-form/images/custom-sailboat-preview-02.jpg',
            'green': 'https://mogzealio.github.io/poster-form/images/custom-mossy-preview-02.jpg',
            'rhubarb': 'https://mogzealio.github.io/poster-form/images/custom-rhubarb-preview-03.jpg',
            'slate': 'https://mogzealio.github.io/poster-form/images/custom-slate-preview.jpg'
        },
        cluster: {
            'default': 'https://mogzealio.github.io/poster-form/images/poster_preview_cluster_sailboat.jpg',
            'green': 'https://mogzealio.github.io/poster-form/images/poster_preview_cluster_mossy.jpg',
            'rhubarb': 'https://mogzealio.github.io/poster-form/images/poster_preview_cluster_rhubarb.jpg',
            'slate': 'https://mogzealio.github.io/poster-form/images/poster_preview_cluster_slate.jpg'
        }
    };
    
    function updateColorPreview(color) {
        const previewContainer = document.getElementById('colorPreview');
        const productType = formState.productType;
        
        if (previewContainer && colorPreviewImages[productType] && colorPreviewImages[productType][color]) {
            previewContainer.style.backgroundImage = `url('${colorPreviewImages[productType][color]}')`;
        }
    }
    
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            formState.color = this.dataset.color;
            updateColorPreview(this.dataset.color);
            updateStep3Button();
        });
    });
    
    function updatePriceDisplay() {
        if (formState.productType && formState.size) {
            const currency = formState.currency;
            const price = CONFIG.prices[currency][formState.productType][formState.size];
            document.querySelector('#priceDisplay .amount').textContent = formatPrice(price, currency);
        }
    }
    
    function updateStep3Button() {
        const btn = document.getElementById('step3Continue');
        btn.disabled = !(formState.size && formState.color);
    }

    document.getElementById('step3Back').addEventListener('click', () => {
        if (formState.productType === 'custom' || formState.productType === 'cluster') {
            goToStep(2);
        } else {
            goToStep(1);
        }
    });

    // Step 3 Continue button - go to framing step
    document.getElementById('step3Continue').addEventListener('click', () => {
        goToStep(4);
    });

    // ============================================
    // STEP 4: FRAMING
    // ============================================

    // Frame preview images - color-specific (16 total: 4 frames × 4 colors)
    // Image naming: frame-{frameType}-{color}.png
    // e.g., frame-white-sailboat.png, frame-oak-mossy.png
    function getFramePreviewImage(frameType, color) {
        // Map color codes to image filenames
        const colorMap = {
            'default': 'sailboat',
            'green': 'mossy',
            'rhubarb': 'rhubarb',
            'slate': 'slate'
        };

        const colorName = colorMap[color] || 'sailboat';
        const baseUrl = 'https://mogzealio.github.io/poster-form/images/';

        if (frameType === 'none') {
            // No frame - just show the poster in selected color
            return `${baseUrl}frame-none-${colorName}.png`;
        }

        // Frame types: white, black, oak, premium_oak
        return `${baseUrl}frame-${frameType}-${colorName}.png`;
    }

    const frameDescriptions = {
        none: 'Poster only - rolled in tissue, plastic-free packing',
        white: 'Lime white painted solid wood frame with glass glazing',
        black: 'Charcoal black painted solid wood frame with glass glazing',
        oak: 'Natural oak-veneered solid wood frame with glass glazing'
    };

    // Update frame price displays based on selected size
    function updateFramePriceDisplays() {
        if (!formState.size) return;

        const currency = formState.currency;
        const size = formState.size;

        // Only update if we have frame prices for this currency
        if (!CONFIG.framePrices[currency]) return;

        const framePrices = CONFIG.framePrices[currency][size];

        // Update each frame option's price display
        Object.keys(framePrices).forEach(frameType => {
            const priceElement = document.getElementById(`framePrice-${frameType}`);
            if (priceElement) {
                const price = framePrices[frameType];
                priceElement.textContent = price === 0 ? '+€0' : `+${formatPrice(price, currency)}`;
            }
        });
    }

    // Frame option selection
    document.querySelectorAll('.frame-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.frame-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            formState.frame = this.dataset.frame;
            updateFramePreview(this.dataset.frame);
            updatePriceBreakdown();
            updateStep4Button();
        });
    });

    function updateFramePreview(frame) {
        const previewContainer = document.getElementById('framePreview');
        const descriptionDiv = document.getElementById('frameDescription');

        // Use the color selected in step 3
        const imageUrl = getFramePreviewImage(frame, formState.color);
        previewContainer.style.backgroundImage = `url('${imageUrl}')`;

        descriptionDiv.textContent = frameDescriptions[frame] || 'Select a frame to see preview';
    }

    function updatePriceBreakdown() {
        if (!formState.productType || !formState.size) return;

        const currency = formState.currency;
        const printPrice = CONFIG.prices[currency][formState.productType][formState.size];

        let framePrice = 0;
        if (formState.frame && CONFIG.framePrices[currency]) {
            framePrice = CONFIG.framePrices[currency][formState.size][formState.frame] || 0;
        }

        const total = printPrice + framePrice;

        // Display color name
        const colorNames = {
            'default': 'Sailboat',
            'green': 'Mossy',
            'rhubarb': 'Rhubarb',
            'slate': 'Slate'
        };
        const colorDisplay = colorNames[formState.color] || formState.color || '--';
        document.getElementById('selectedColor').textContent = colorDisplay;

        document.getElementById('printPrice').textContent = formatPrice(printPrice, currency);
        document.getElementById('framePrice').textContent = formatPrice(framePrice, currency);
        document.getElementById('totalPrice').textContent = formatPrice(total, currency);
    }

    function updateStep4Button() {
        const btn = document.getElementById('step4AddToCart');
        btn.disabled = !formState.frame;
        btn.textContent = (formState.frame && formState.frame !== 'none') ? 'Add to Cart' : 'Continue';
    }

    // Step 4 navigation
    document.getElementById('step4Back').addEventListener('click', () => {
        goToStep(3);
    });

    document.getElementById('step4AddToCart').addEventListener('click', () => {
        // Add current selection to cart
        const cartItem = {
            productType: formState.productType,
            size: formState.size,
            color: formState.color,
            frame: formState.frame,
            townlandId: formState.locationValue,
            townlandDisplay: formState.townlandDisplay,
            markerLon: (formState.productType === 'cluster' && formState.markerLon) ? formState.markerLon : null,
            markerLat: (formState.productType === 'cluster' && formState.markerLat) ? formState.markerLat : null
        };

        cart.addItem(cartItem);

        // Show success message and cart options
        showCartOptions();
    });

    // ============================================
    // CART & CHECKOUT
    // ============================================

    function showCartOptions() {
        // Hide Step 3, show cart options screen
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));

        const cartOptionsDiv = document.getElementById('cartOptions');
        if (cartOptionsDiv) {
            cartOptionsDiv.classList.add('active');
        }
    }

    // Add Another Poster button
    const addAnotherBtn = document.getElementById('addAnotherPoster');
    if (addAnotherBtn) {
        addAnotherBtn.addEventListener('click', () => {
            // Reset form state
            formState.productType = null;
            formState.locationType = null;
            formState.locationValue = null;
            formState.townlandDisplay = null;
            formState.size = null;
            formState.color = null;
            formState.frame = null;
            formState.markerLon = null;
            formState.markerLat = null;

            // Clear selections
            document.querySelectorAll('[data-product], .size-option, .color-option, .frame-option').forEach(el => {
                el.classList.remove('selected');
            });

            // Go back to Step 1
            goToStep(1);
        });
    }

    // Update shipping options based on framed items
    function updateShippingOptions() {
        const hasFramedItems = cart.items.some(item => item.frame && item.frame !== 'none');
        const shippingCards = document.querySelectorAll('#shippingSelection .option-card');

        shippingCards.forEach(card => {
            const country = card.dataset.country;

            if (hasFramedItems && country !== 'IE') {
                // Disable non-Ireland options if framed
                card.classList.add('disabled');

                // Add explanation text if not already present
                if (!card.querySelector('.disabled-reason')) {
                    const reason = document.createElement('p');
                    reason.className = 'disabled-reason';
                    reason.textContent = 'Framed prints ship to Ireland only';
                    card.appendChild(reason);
                }
            } else {
                // Re-enable if user removed framed items
                card.classList.remove('disabled');

                const reason = card.querySelector('.disabled-reason');
                if (reason) reason.remove();
            }
        });

        // If already selected non-IE option with framed items, deselect it
        if (hasFramedItems && formState.shippingCountry && formState.shippingCountry !== 'IE') {
            formState.shippingCountry = null;
            shippingCards.forEach(c => c.classList.remove('selected'));
            const checkoutBtn = document.getElementById('proceedToCheckout');
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
            }
        }
    }

    // Proceed to Shipping button (from cart)
    const proceedShippingBtn = document.getElementById('proceedToShipping');
    if (proceedShippingBtn) {
        proceedShippingBtn.addEventListener('click', () => {
            if (cart.items.length === 0) {
                alert('Your cart is empty!');
                return;
            }

            // Show shipping selection step
            const shippingStep = document.getElementById('shippingSelection');
            const cartStep = document.getElementById('cartOptions');
            if (shippingStep && cartStep) {
                cartStep.classList.remove('active');
                shippingStep.classList.add('active');

                // Update shipping restrictions based on framed items
                updateShippingOptions();
            }
        });
    }

    // Shipping country selection
    const shippingCards = document.querySelectorAll('#shippingSelection .option-card');
    shippingCards.forEach(card => {
        card.addEventListener('click', () => {
            // Remove selected from all cards
            shippingCards.forEach(c => c.classList.remove('selected'));

            // Mark this card as selected
            card.classList.add('selected');

            // Store selected country
            formState.shippingCountry = card.dataset.country;

            // Update currency based on shipping country
            formState.currency = getCurrencyForCountry(formState.shippingCountry);

            // Update all price displays to match new currency
            updatePriceDisplays();
            cart.updateUI();

            console.log(`Currency changed to ${formState.currency.toUpperCase()} for ${formState.shippingCountry}`);

            // Enable checkout button
            const checkoutBtn = document.getElementById('proceedToCheckout');
            if (checkoutBtn) {
                checkoutBtn.disabled = false;
            }
        });
    });

    // Back button from shipping to cart
    const shippingBackBtn = document.getElementById('shippingBack');
    if (shippingBackBtn) {
        shippingBackBtn.addEventListener('click', () => {
            const shippingStep = document.getElementById('shippingSelection');
            const cartStep = document.getElementById('cartOptions');
            if (shippingStep && cartStep) {
                shippingStep.classList.remove('active');
                cartStep.classList.add('active');
            }
        });
    }

    // Proceed to Checkout button (from shipping selection)
    const proceedCheckoutBtn = document.getElementById('proceedToCheckout');
    if (proceedCheckoutBtn) {
        proceedCheckoutBtn.addEventListener('click', async () => {
            if (cart.items.length === 0) {
                alert('Your cart is empty!');
                return;
            }

            if (!formState.shippingCountry) {
                alert('Please select a shipping destination');
                return;
            }

            goToStep('loading');

            try {
                // Prepare checkout data with cart items and shipping country
                const checkoutData = {
                    cartItems: cart.items,
                    shippingCountry: formState.shippingCountry,
                    successUrl: CONFIG.successUrl,
                    cancelUrl: CONFIG.cancelUrl
                };

                // Include location parameter if available (for physical store tracking)
                const referralLocation = localStorage.getItem('referral_location');
                if (referralLocation) {
                    checkoutData.referralLocation = referralLocation;
                    console.log('Including referral location:', referralLocation);
                }

                console.log('Sending checkout request:', checkoutData);

                // Call Cloudflare Worker to create checkout session
                const response = await fetch(`${CONFIG.workerUrl}/create-checkout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(checkoutData)
                });
            
            console.log('Response status:', response.status);
            
            // Get response text first (in case it's not JSON)
            const responseText = await response.text();
            console.log('Response text:', responseText);
            
            if (!response.ok) {
                // Try to parse as JSON, but handle plain text too
                let errorMessage;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || 'Failed to create checkout session';
                } catch (e) {
                    errorMessage = responseText || 'Failed to create checkout session';
                }
                throw new Error(errorMessage);
            }
            
            // Parse the successful response
            const data = JSON.parse(responseText);
            
            if (!data.url) {
                throw new Error('No checkout URL received');
            }
            
                // Save cart to localStorage before redirecting
                localStorage.setItem('posterCart', JSON.stringify({
                    items: cart.items,
                    shippingCountry: formState.shippingCountry,
                    currency: formState.currency
                }));

                // Redirect to Stripe Checkout
                console.log('Redirecting to:', data.url);
                window.location.href = data.url;

            } catch (error) {
                console.error('Checkout error:', error);
                console.error('Error details:', error.message);

                // Go back to cart options on error
                const cartOptionsDiv = document.getElementById('cartOptions');
                if (cartOptionsDiv) {
                    cartOptionsDiv.classList.add('active');
                }

                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = `Error: ${error.message}. Please try again.`;
                    errorMsg.classList.add('active');
                    setTimeout(() => errorMsg.classList.remove('active'), 5000);
                }
            }
        });
    }
    
    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        const searchWrapper = document.querySelector('.search-wrapper');
        if (searchWrapper && !searchWrapper.contains(e.target)) {
            document.getElementById('autocompleteResults').classList.remove('active');
        }
    });
    
    // Initialize: Set eircode as default location type
    formState.locationType = 'eircode';

    // Restore cart if user came back from cancelled checkout
    if (returningFromCheckout) {
        console.log('User returned from cancelled checkout - restoring cart...');

        try {
            const cartData = JSON.parse(savedCart);

            // Restore cart items
            cart.items = cartData.items || [];

            // Restore shipping country and currency
            if (cartData.shippingCountry) {
                formState.shippingCountry = cartData.shippingCountry;
                formState.currency = cartData.currency || getCurrencyForCountry(cartData.shippingCountry);
            }

            // Update cart UI with restored items
            cart.updateUI();
            updatePriceDisplays();

            // Show shipping selection step
            document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
            const shippingStep = document.getElementById('shippingSelection');
            if (shippingStep) {
                shippingStep.classList.add('active');

                // Pre-select the shipping country if available
                if (formState.shippingCountry) {
                    const selectedCard = document.querySelector(`#shippingSelection .option-card[data-country="${formState.shippingCountry}"]`);
                    if (selectedCard) {
                        selectedCard.classList.add('selected');
                        const checkoutBtn = document.getElementById('proceedToCheckout');
                        if (checkoutBtn) {
                            checkoutBtn.disabled = false;
                        }
                    }
                }
            }

            console.log('Cart restored successfully');

            // Clear the saved cart from localStorage after restoration
            localStorage.removeItem('posterCart');

        } catch (e) {
            console.error('Error restoring cart:', e);
            localStorage.removeItem('posterCart');
        }
    }

    // Clear cart if checkout was successful
    if (checkoutSuccessful) {
        console.log('Checkout successful - clearing cart');
        localStorage.removeItem('posterCart');
        cart.clear();
    }

    // ============================================================================
    // PREVIEW REQUEST FUNCTIONALITY
    // ============================================================================

    const previewSection = document.getElementById('previewSection');

    // Create inline preview form HTML
    if (previewSection && !document.getElementById('previewForm')) {
        const previewHTML = `
<div style="margin: 20px 0; padding: 20px; background: rgba(90, 111, 100, 0.1); border: 1px solid #5a6f64; border-radius: 8px;">
<h3 style="margin: 0 0 10px 0; font-size: 16px; color: #DEDED3;">Get a Preview First</h3>
<p id="previewDescription" style="margin: 0 0 15px 0; font-size: 14px; color: #B8B8A8; line-height: 1.5;">Enter your email to receive a preview before purchasing.</p>
<form id="previewForm">
<div class="form-group">
<label for="previewEmail" style="display: block; margin-bottom: 5px; font-size: 14px; color: #DEDED3;">Email Address *</label>
<input type="email" id="previewEmail" required placeholder="you@example.com" style="width: 100%; padding: 10px; background: #2a3a32; border: 1px solid #5a6f64; border-radius: 4px; color: #DEDED3; font-size: 14px;">
</div>
<div class="form-group" style="margin: 15px 0;">
<label class="checkbox-label" style="display: flex; align-items: center; font-size: 14px; color: #B8B8A8; cursor: pointer;">
<input type="checkbox" id="previewOptIn" style="margin-right: 8px;">
<span>Keep me updated about new products and features</span>
</label>
</div>
<div id="previewError" class="error-message" style="display: none; margin: 10px 0;"></div>
<div id="previewSuccess" class="success-message" style="display: none; margin: 10px 0; color: #7fb069;"></div>
<div style="display: flex; gap: 10px; margin-top: 15px;">
<button type="button" id="cancelPreview" class="btn-secondary" style="flex: 1;">Cancel</button>
<button type="submit" id="submitPreview" class="btn-primary" style="flex: 2;">Send Preview</button>
</div>
<p style="margin: 15px 0 0 0; font-size: 12px; color: #8a9a8f; font-style: italic;">You'll receive a lower-resolution preview via email. The final poster will be printed at 300dpi on high quality matte art paper.</p>
</form>
</div>
        `;
        previewSection.innerHTML = previewHTML;
    }

    // Show preview option only for custom posters
    function updatePreviewVisibility() {
        if (!previewSection) return;

        // Only show for custom product type
        const showPreview = formState.productType === 'custom' || formState.productType === 'cluster';
        previewSection.style.display = showPreview ? 'block' : 'none';
    }

    // Rate limiting helpers (client-side)
    const PREVIEW_COOLDOWN_HOURS = 24;

    function checkPreviewCooldown(email) {
        try {
            const key = `preview_request_${email.toLowerCase()}`;
            const timestamp = localStorage.getItem(key);

            if (!timestamp) return { allowed: true };

            const requestTime = parseInt(timestamp);
            const now = Date.now();
            const hoursAgo = (now - requestTime) / (1000 * 60 * 60);

            if (hoursAgo < PREVIEW_COOLDOWN_HOURS) {
                const hoursRemaining = Math.ceil(PREVIEW_COOLDOWN_HOURS - hoursAgo);
                return {
                    allowed: false,
                    message: `Preview already requested. Please wait ${hoursRemaining} hour(s) before requesting another. Thanks!`
                };
            }

            return { allowed: true };
        } catch (e) {
            // If localStorage fails, allow the request
            return { allowed: true };
        }
    }

    function recordPreviewRequest(email) {
        try {
            const key = `preview_request_${email.toLowerCase()}`;
            localStorage.setItem(key, Date.now().toString());
        } catch (e) {
            // Ignore localStorage errors
            console.warn('Could not save preview request to localStorage');
        }
    }

    // Create "Get a preview" button dynamically in step 3
    const step3ButtonGroup = document.querySelector('[data-step="3"] .button-group');
    if (step3ButtonGroup && !document.getElementById('togglePreviewBtn')) {
        const previewToggleBtn = document.createElement('button');
        previewToggleBtn.type = 'button';
        previewToggleBtn.id = 'togglePreviewBtn';
        previewToggleBtn.className = 'btn-secondary';
        previewToggleBtn.textContent = 'Get a Preview';
        previewToggleBtn.style.display = 'none'; // Hidden by default

        // Insert between Back and Add to Cart
        const step3Back = document.getElementById('step3Back');
        step3Back.parentNode.insertBefore(previewToggleBtn, step3Back.nextSibling);
    }

    const togglePreviewBtn = document.getElementById('togglePreviewBtn');
    const previewForm = document.getElementById('previewForm');
    const previewEmailInput = document.getElementById('previewEmail');
    const previewOptIn = document.getElementById('previewOptIn');
    const previewError = document.getElementById('previewError');
    const previewSuccess = document.getElementById('previewSuccess');
    const cancelPreviewBtn = document.getElementById('cancelPreview');

    // Toggle preview section visibility
    if (togglePreviewBtn && previewSection) {
        togglePreviewBtn.addEventListener('click', () => {
            const isVisible = previewSection.style.display === 'block';
            previewSection.style.display = isVisible ? 'none' : 'block';
            togglePreviewBtn.textContent = isVisible ? 'Get a Preview' : 'Hide Preview';

            if (!isVisible) {
                // Reset form when opening
                if (previewForm) previewForm.reset();
                if (previewError) previewError.style.display = 'none';
                if (previewSuccess) previewSuccess.style.display = 'none';

                // Update description with townland info
                const previewDesc = document.getElementById('previewDescription');
                if (previewDesc && formState.townlandDisplay) {
                    previewDesc.textContent = `Enter your email to receive a preview Townlands of Ireland poster customised to ${formState.townlandDisplay} before purchasing. You should receive your preview within 5 minutes.`;
                }
            }
        });
    }

    // Cancel button hides the preview section
    if (cancelPreviewBtn && previewSection && togglePreviewBtn) {
        cancelPreviewBtn.addEventListener('click', () => {
            previewSection.style.display = 'none';
            togglePreviewBtn.textContent = 'Get a Preview';
        });
    }

    // Handle preview form submission
    if (previewForm) {
        previewForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submitPreview');
            const originalText = submitBtn.textContent;

            try {
                // Validate we're on custom product type
                if (formState.productType !== 'custom' && formState.productType !== 'cluster') {
                    throw new Error('Preview is only available for custom and cluster posters');
                }

                // Validate required fields from formState
                if (!formState.locationValue || !formState.townlandDisplay) {
                    throw new Error('Please select a townland first');
                }

                if (!formState.size) {
                    throw new Error('Please select a size first');
                }

                if (!formState.color) {
                    throw new Error('Please select a color scheme first');
                }

                const customerEmail = previewEmailInput.value.trim();
                if (!customerEmail) {
                    throw new Error('Please enter your email address');
                }

                // Check client-side rate limiting
                const cooldownCheck = checkPreviewCooldown(customerEmail);
                if (!cooldownCheck.allowed) {
                    throw new Error(cooldownCheck.message);
                }

                // Hide errors, show loading
                previewError.style.display = 'none';
                previewSuccess.style.display = 'none';
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                // Build preview request using formState
                const previewRequest = {
                    townland_id: formState.locationValue,
                    townland_display: formState.townlandDisplay,
                    product_type: formState.productType,
                    size: formState.size,
                    color: formState.color === 'default' ? 'green' : formState.color,
                    customer_email: customerEmail,
                    opt_in_marketing: previewOptIn.checked,
                    marker_lon: (formState.productType === 'cluster' && formState.markerLon) ? formState.markerLon : undefined,
                    marker_lat: (formState.productType === 'cluster' && formState.markerLat) ? formState.markerLat : undefined
                };

                console.log('Sending preview request:', previewRequest);

                // Send to worker
                const response = await fetch(`${CONFIG.workerUrl}/create-preview-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(previewRequest)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create preview request');
                }

                const result = await response.json();
                console.log('Preview request created:', result);

                // Record the request in localStorage
                recordPreviewRequest(customerEmail);

                // Disable the preview button for this session
                if (togglePreviewBtn) {
                    togglePreviewBtn.disabled = true;
                    togglePreviewBtn.textContent = 'Preview Requested';
                    togglePreviewBtn.style.opacity = '0.6';
                }

                // Show success message
                previewSuccess.textContent = result.message || 'Preview request sent! Check your email shortly.';
                previewSuccess.style.display = 'block';

                // Reset form after delay
                setTimeout(() => {
                    if (previewSection) {
                        previewSection.style.display = 'none';
                    }
                    previewForm.reset();
                    previewSuccess.style.display = 'none';
                }, 3000);

            } catch (error) {
                console.error('Preview request error:', error);
                previewError.textContent = error.message;
                previewError.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Auto-populate from preview email URL parameters
    if (fromPreviewEmail) {
        console.log('Auto-populating from preview email URL parameters...');

        const townlandId = urlParams.get('townland');
        const size = urlParams.get('size');
        const color = urlParams.get('color');

        // Wait for locations to load, then auto-populate
        async function autoPopulateCart() {
            try {
                // Ensure locations are loaded
                if (!locationsLoaded) {
                    await loadLocations();
                }

                // Find the townland in the data
                const townland = locations.find(t => t.id === townlandId);

                if (townland) {
                    console.log('Found townland:', townland.display);

                    // Add item to cart directly
                    cart.addItem({
                        townlandId: townlandId,
                        townlandDisplay: townland.display,
                        size: size,
                        color: color,
                        productType: 'custom'
                    });

                    // Show cart options screen
                    showCartOptions();

                    // Navigate to cart section
                    window.location.hash = '#buy-poster';

                    // Clean up URL parameters
                    window.history.replaceState({}, document.title, window.location.pathname + '#buy-poster');

                    console.log('Cart auto-populated from preview email');
                } else {
                    console.warn('Townland not found:', townlandId);
                }
            } catch (error) {
                console.error('Failed to auto-populate cart:', error);
            }
        }

        autoPopulateCart();
    }

    console.log('Poster form initialized successfully');
    } // end init function
    
    // Start initialization: Load Fuse.js first, then init
    loadFuse(function() {
        if (document.readyState === 'loading') {
            console.log('Waiting for DOM...');
            document.addEventListener('DOMContentLoaded', init);
        } else {
            console.log('DOM already ready');
            init();
        }
    });

})();

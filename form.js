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
                    custom: { small: 35, medium: 45, large: 55 }
                },
                gbp: {
                    standard: { small: 26, medium: 30, large: 38 },
                    custom: { small: 30, medium: 38, large: 47 }
                },
                usd: {
                    standard: { small: 33, medium: 38, large: 50 },
                    custom: { small: 38, medium: 50, large: 60 }
                }
            },

            // Currency symbols
            currencySymbols: {
                eur: '€',
                gbp: '£',
                usd: '$'
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
        shippingCountry: null, // 'IE', 'GB', 'EU', 'US', 'CA'
        currency: 'eur' // 'eur', 'gbp', 'usd' - defaults to EUR
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

        // Update option cards on step 1
        const standardCard = document.querySelector('[data-product="standard"] .price');
        const customCard = document.querySelector('[data-product="custom"] .price');
        if (standardCard) {
            standardCard.textContent = `From ${formatPrice(CONFIG.prices[currency].standard.small, currency)} + postage`;
        }
        if (customCard) {
            customCard.textContent = `From ${formatPrice(CONFIG.prices[currency].custom.small, currency)} + postage`;
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
                return total + price;
            }, 0);
        },

        updateUI() {
            const currency = formState.currency;

            // Update cart items display
            const cartItems = document.getElementById('cartItems');
            if (cartItems) {
                cartItems.innerHTML = this.items.map((item, index) => {
                    const price = CONFIG.prices[currency][item.productType][item.size];
                    const sizeLabel = {small: 'A3', medium: 'A2', large: 'A1'}[item.size];
                    const typeLabel = item.productType === 'custom' ? 'Custom' : 'Standard';
                    const location = item.townlandDisplay ? ` - ${item.townlandDisplay}` : '';

                    return `
                        <div class="cart-item">
                            <div class="cart-item-details">
                                <strong>${typeLabel} ${sizeLabel}</strong>
                                <div class="cart-item-meta">${item.color}${location}</div>
                            </div>
                            <div class="cart-item-price">${formatPrice(price, currency)}</div>
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
    
    // Load locations from external JSON file (NEW FORMAT with IDs)
    async function loadLocations() {
        try {
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

        } catch (error) {
            console.error('Error loading locations:', error);
            alert('Failed to load townland data. Please refresh the page.');
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

    async function lookupEircodeViaGoogle(eircode) {
        /**
         * Look up eircode via backend proxy (secure - API key hidden).
         * Returns townland suggestion from Google's data.
         * Now includes distance filtering to avoid false matches.
         */
        try {
            // Call our backend worker (not Google directly!)
            const response = await fetch(`${CONFIG.workerUrl}/lookup-eircode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eircode })
            });

            if (!response.ok) {
                console.warn('Backend lookup failed:', response.status);
                return null;
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

            // Check for locations loaded
            if (!locationsLoaded || locations.length === 0) {
                console.warn('Locations not loaded yet');
                return null;
            }

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
                    matchType: 'exact' // Exact name match
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
                    matchType: 'geographic' // Matched by location only
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
         */
        const suggestionDiv = document.getElementById('townlandSuggestion');
        if (!suggestionDiv) {
            console.error('townlandSuggestion div not found in HTML!');
            return;
        }

        suggestionDiv.innerHTML = '<div class="loading">🔍 Looking up your townland...</div>';
        suggestionDiv.classList.add('active');

        const result = await lookupEircodeViaGoogle(eircode);

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
                toggleBtn.style.display = formState.productType === 'custom' ? 'inline-block' : 'none';
            }
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
    // STEP 1: PRODUCT TYPE
    // ============================================
    
    document.querySelectorAll('[data-product]').forEach(card => {
        card.addEventListener('click', function() {
            // Deselect all
            document.querySelectorAll('[data-product]').forEach(c => c.classList.remove('selected'));
            
            // Select this one
            this.classList.add('selected');
            formState.productType = this.dataset.product;
            
            // Enable continue button
            document.getElementById('step1Next').disabled = false;
        });
    });
    
    document.getElementById('step1Next').addEventListener('click', () => {
        if (formState.productType === 'custom') {
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
    document.getElementById('eircodeInput').addEventListener('input', function(e) {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Format as A65 F4E2
        if (value.length > 3) {
            value = value.slice(0, 3) + ' ' + value.slice(3, 7);
        }

        this.value = value;

        // Auto-lookup when eircode is complete
        if (value.replace(/\s/g, '').length === 7) {
            showTownlandSuggestion(value);
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
        const btn = document.getElementById('step3Checkout');
        btn.disabled = !(formState.size && formState.color);
    }
    
    document.getElementById('step3Back').addEventListener('click', () => {
        if (formState.productType === 'custom') {
            goToStep(2);
        } else {
            goToStep(1);
        }
    });
    
    // ============================================
    // CART & CHECKOUT
    // ============================================

    // Add to Cart button
    document.getElementById('step3Checkout').addEventListener('click', () => {
        // Add current selection to cart
        const cartItem = {
            productType: formState.productType,
            size: formState.size,
            color: formState.color,
            townlandId: formState.locationValue,
            townlandDisplay: formState.townlandDisplay
        };

        cart.addItem(cartItem);

        // Show success message and cart options
        showCartOptions();
    });

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

            // Clear selections
            document.querySelectorAll('[data-product], .size-option, .color-option').forEach(el => {
                el.classList.remove('selected');
            });

            // Go back to Step 1
            goToStep(1);
        });
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
<span>Keep me updated about new designs and ideas.</span>
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
        const showPreview = formState.productType === 'custom';
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
                if (formState.productType !== 'custom') {
                    throw new Error('Preview is only available for custom posters');
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
                    size: formState.size,
                    color: formState.color === 'default' ? 'green' : formState.color,
                    customer_email: customerEmail,
                    opt_in_marketing: previewOptIn.checked
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

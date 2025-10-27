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
        
        // ============================================
        // CONFIGURATION - UPDATE THESE VALUES
        // ============================================
        
        const CONFIG = {
            workerUrl: 'https://poster-checkout.jack-7a4.workers.dev/',
            successUrl: window.location.origin + '/success', // Change to your success page
            cancelUrl: window.location.origin, // Change to your cancel/home page
            
            // Prices for display (should match your Stripe prices)
            prices: {
                standard: { small: 25, medium: 35, large: 45 },
                custom: { small: 35, medium: 45, large: 55 }
            }
        };
    
    // ============================================
    // STATE MANAGEMENT
    // ============================================
    
    const formState = {
        currentStep: 1,
        productType: null, // 'standard' or 'custom'
        locationType: null, // 'eircode' or 'address'
        locationValue: null,
        size: null, // 'small', 'medium', 'large'
        color: null // 'blue', 'green', 'red'
    };
    
    // ============================================
    // LOCATION DATA - Loaded from External File
    // ============================================
    
    // UPDATE THIS URL to point to your hosted locations.json file
    const LOCATIONS_JSON_URL = 'https://pub-ddc543ba1c324125b2264e2dc4f23293.r2.dev/locations.json';
    
    let locations = [];
    let locationObjects = [];
    let fuse = null;
    let locationsLoaded = false;
    
    // Load locations from external JSON file
    async function loadLocations() {
        try {
            const response = await fetch(LOCATIONS_JSON_URL);
            if (!response.ok) {
                throw new Error('Failed to load locations');
            }
            
            locations = await response.json();
            
            // Parse locations for searching
            locationObjects = locations.map(fullAddress => ({
                name: fullAddress.split(',')[0].trim(),
                fullAddress: fullAddress
            }));
            
            // Initialize Fuse.js for fuzzy search
            fuse = new Fuse(locationObjects, {
                threshold: 0.3,
                keys: ['name']
            });
            
            locationsLoaded = true;
            console.log(`Loaded ${locations.length} locations`);
            
        } catch (error) {
            console.error('Error loading locations:', error);
            // Fallback to sample data for testing
            locations = [
                "Dublin, Dublin City, Co. Dublin",
                "Cork, Cork City, Co. Cork",
                "Galway, Galway City, Co. Galway",
                "Limerick, Limerick City, Co. Limerick",
                "Waterford, Waterford City, Co. Waterford",
                "Arklow, Arklow, Co. Wicklow",
                "Killarney, Killarney, Co. Kerry",
                "Tralee, Tralee, Co. Kerry"
            ];
            
            locationObjects = locations.map(fullAddress => ({
                name: fullAddress.split(',')[0].trim(),
                fullAddress: fullAddress
            }));
            
            fuse = new Fuse(locationObjects, {
                threshold: 0.3,
                keys: ['name']
            });
            
            locationsLoaded = true;
            console.warn('Using fallback sample locations');
        }
    }
    
    // Load locations when page loads
    loadLocations();
    
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
            
            // Clear inputs
            document.getElementById('eircodeInput').value = '';
            document.getElementById('addressInput').value = '';
            document.getElementById('autocompleteResults').classList.remove('active');
            
            updateStep2Button();
        });
    });
    
    // Eircode input
    document.getElementById('eircodeInput').addEventListener('input', function(e) {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // Format as A65 F4E2
        if (value.length > 3) {
            value = value.slice(0, 3) + ' ' + value.slice(3, 7);
        }
        
        this.value = value;
        formState.locationType = 'eircode';
        formState.locationValue = value;
        updateStep2Button();
    });
    
    // Address autocomplete
    let selectedIndex = -1;
    let currentResults = [];
    
    document.getElementById('addressInput').addEventListener('input', function(e) {
        const query = e.target.value.trim();
        const resultsDiv = document.getElementById('autocompleteResults');
        
        // Check if locations are loaded
        if (!locationsLoaded || !fuse) {
            resultsDiv.innerHTML = '<div class="autocomplete-item">Loading locations...</div>';
            resultsDiv.classList.add('active');
            return;
        }
        
        if (query.length < 2) {
            resultsDiv.classList.remove('active');
            formState.locationValue = null;
            updateStep2Button();
            return;
        }
        
        // Search locations
        const searchResults = fuse.search(query);
        currentResults = searchResults.slice(0, 10);
        
        if (currentResults.length === 0) {
            resultsDiv.innerHTML = '<div class="autocomplete-item">No locations found</div>';
            resultsDiv.classList.add('active');
            formState.locationValue = null;
            updateStep2Button();
            return;
        }
        
        // Display results
        const html = currentResults.map((result, index) => {
            const parts = result.item.fullAddress.split(',');
            const locationName = parts[0].trim();
            const details = parts.slice(1).join(',').trim();
            
            return `
                <div class="autocomplete-item" data-index="${index}">
                    <strong>${locationName}</strong>
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
                    selectLocation(currentResults[index].item.fullAddress);
                }
            });
        });
    });
    
    function selectLocation(fullAddress) {
        document.getElementById('addressInput').value = fullAddress;
        document.getElementById('autocompleteResults').classList.remove('active');
        formState.locationType = 'address';
        formState.locationValue = fullAddress;
        updateStep2Button();
    }
    
    function updateStep2Button() {
        const btn = document.getElementById('step2Next');
        
        if (formState.locationType === 'eircode') {
            // Valid eircode format: XXX XXXX (7 chars without space)
            const eircode = formState.locationValue || '';
            const isValid = eircode.replace(/\s/g, '').length === 7;
            btn.disabled = !isValid;
        } else if (formState.locationType === 'address') {
            btn.disabled = !formState.locationValue;
        } else {
            btn.disabled = true;
        }
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
    
    // Color selection
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            formState.color = this.dataset.color;
            updateStep3Button();
        });
    });
    
    function updatePriceDisplay() {
        if (formState.productType && formState.size) {
            const price = CONFIG.prices[formState.productType][formState.size];
            document.querySelector('#priceDisplay .amount').textContent = `€${price}`;
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
    // CHECKOUT
    // ============================================
    
    document.getElementById('step3Checkout').addEventListener('click', async () => {
        goToStep('loading');
        
        try {
            // Prepare checkout data
            const checkoutData = {
                productType: formState.productType,
                size: formState.size,
                color: formState.color,
                locationType: formState.locationType,
                locationValue: formState.locationValue,
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
            
            // Redirect to Stripe Checkout
            console.log('Redirecting to:', data.url);
            window.location.href = data.url;
            
        } catch (error) {
            console.error('Checkout error:', error);
            console.error('Error details:', error.message);
            goToStep(3);
            
            const errorMsg = document.getElementById('errorMessage');
            errorMsg.textContent = `Error: ${error.message}. Please try again.`;
            errorMsg.classList.add('active');
            
            setTimeout(() => errorMsg.classList.remove('active'), 5000);
        }
    });
    
    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        const searchWrapper = document.querySelector('.search-wrapper');
        if (searchWrapper && !searchWrapper.contains(e.target)) {
            document.getElementById('autocompleteResults').classList.remove('active');
        }
    });
    
    // Initialize: Set eircode as default location type
    formState.locationType = 'eircode';
    
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

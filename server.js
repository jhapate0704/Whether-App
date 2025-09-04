// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database file path
const DATABASE_FILE = path.join(__dirname, 'weatherData.json');

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize database file if it doesn't exist
const initializeDatabase = () => {
    try {
        if (!fs.existsSync(DATABASE_FILE)) {
            fs.writeFileSync(DATABASE_FILE, JSON.stringify([], null, 2));
            console.log('Database file initialized successfully');
        }
    } catch (error) {
        console.error('Error initializing database:', error.message);
    }
};

// Helper function to read weather data from file
const readWeatherData = () => {
    try {
        const data = fs.readFileSync(DATABASE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading weather data:', error.message);
        return [];
    }
};

// Helper function to write weather data to file
const writeWeatherData = (data) => {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing weather data:', error.message);
        return false;
    }
};

// Helper function to generate unique ID
const generateUniqueId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

// Authentication middleware
const authMiddleware = (req, res, next) => {
    const { role, password } = req.query;
    
    // Check if role and password are provided
    if (!role || !password) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please provide role and password in query parameters.",
            error: "Missing credentials"
        });
    }
    
    // Validate admin credentials
    if (role !== 'admin' || password !== 'masai') {
        return res.status(403).json({
            success: false,
            message: "Access denied. Invalid credentials.",
            error: "Authentication failed"
        });
    }
    
    // Authentication successful
    next();
};

// Middleware for logging requests
const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
};

// Apply request logging middleware
app.use(requestLogger);

// Routes

// 1. POST /weather - Add weather details of a particular city
app.post('/weather', (req, res) => {
    try {
        const { cityName, temperature, humidity, windSpeed, weatherCondition, country } = req.body;
        
        // Validate required fields
        if (!cityName || temperature === undefined) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields. cityName and temperature are mandatory.",
                error: "Validation error"
            });
        }
        
        // Read existing data
        const weatherData = readWeatherData();
        
        // Check if city already exists
        const existingCity = weatherData.find(city => 
            city.cityName.toLowerCase() === cityName.toLowerCase()
        );
        
        if (existingCity) {
            return res.status(409).json({
                success: false,
                message: "City already exists in database.",
                error: "Duplicate entry"
            });
        }
        
        // Create new weather record
        const newWeatherRecord = {
            id: generateUniqueId(),
            cityName: cityName.trim(),
            temperature: parseFloat(temperature),
            humidity: humidity ? parseFloat(humidity) : null,
            windSpeed: windSpeed ? parseFloat(windSpeed) : null,
            weatherCondition: weatherCondition || null,
            country: country || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Add to database
        weatherData.push(newWeatherRecord);
        
        // Save to file
        const saveSuccess = writeWeatherData(weatherData);
        
        if (!saveSuccess) {
            return res.status(500).json({
                success: false,
                message: "Failed to save weather data.",
                error: "Database error"
            });
        }
        
        res.status(201).json({
            success: true,
            message: "Weather data added successfully.",
            data: newWeatherRecord
        });
        
    } catch (error) {
        console.error('Error in POST /weather:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred.",
            error: error.message
        });
    }
});

// 2. GET /weather - Retrieve all cities (admin only)
app.get('/weather', authMiddleware, (req, res) => {
    try {
        const weatherData = readWeatherData();
        
        res.status(200).json({
            success: true,
            message: "Weather data retrieved successfully.",
            count: weatherData.length,
            data: weatherData
        });
        
    } catch (error) {
        console.error('Error in GET /weather:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred.",
            error: error.message
        });
    }
});

// 3. GET /weather/search - Retrieve weather details of a particular city by name
app.get('/weather/search', (req, res) => {
    try {
        const { cityName } = req.query;
        
        if (!cityName) {
            return res.status(400).json({
                success: false,
                message: "City name is required in query parameters.",
                error: "Missing parameter"
            });
        }
        
        const weatherData = readWeatherData();
        
        // Find city (case-insensitive search)
        const cityData = weatherData.find(city => 
            city.cityName.toLowerCase() === cityName.toLowerCase().trim()
        );
        
        if (!cityData) {
            return res.status(404).json({
                success: false,
                message: `Weather data for city '${cityName}' not found.`,
                error: "City not found"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "City weather data retrieved successfully.",
            data: cityData
        });
        
    } catch (error) {
        console.error('Error in GET /weather/search:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred.",
            error: error.message
        });
    }
});

// 4. PUT /weather/:id - Update weather details by ID (admin only)
app.put('/weather/:id', authMiddleware, (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "City ID is required in URL parameters.",
                error: "Missing parameter"
            });
        }
        
        const weatherData = readWeatherData();
        
        // Find city index
        const cityIndex = weatherData.findIndex(city => city.id === id);
        
        if (cityIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Weather data with ID '${id}' not found.`,
                error: "City not found"
            });
        }
        
        // Validate and update fields
        const allowedFields = ['cityName', 'temperature', 'humidity', 'windSpeed', 'weatherCondition', 'country'];
        const currentCity = weatherData[cityIndex];
        
        // Check if cityName is being changed and if it conflicts with existing data
        if (updateData.cityName && updateData.cityName.toLowerCase() !== currentCity.cityName.toLowerCase()) {
            const nameConflict = weatherData.find((city, index) => 
                index !== cityIndex && city.cityName.toLowerCase() === updateData.cityName.toLowerCase()
            );
            
            if (nameConflict) {
                return res.status(409).json({
                    success: false,
                    message: "City name already exists in database.",
                    error: "Duplicate entry"
                });
            }
        }
        
        // Update fields
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                if (field === 'temperature' || field === 'humidity' || field === 'windSpeed') {
                    weatherData[cityIndex][field] = parseFloat(updateData[field]);
                } else if (field === 'cityName') {
                    weatherData[cityIndex][field] = updateData[field].trim();
                } else {
                    weatherData[cityIndex][field] = updateData[field];
                }
            }
        });
        
        // Update timestamp
        weatherData[cityIndex].updatedAt = new Date().toISOString();
        
        // Save to file
        const saveSuccess = writeWeatherData(weatherData);
        
        if (!saveSuccess) {
            return res.status(500).json({
                success: false,
                message: "Failed to update weather data.",
                error: "Database error"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Weather data updated successfully.",
            data: weatherData[cityIndex]
        });
        
    } catch (error) {
        console.error('Error in PUT /weather/:id:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred.",
            error: error.message
        });
    }
});

// 5. DELETE /weather/:id - Delete weather details by ID (admin only)
app.delete('/weather/:id', authMiddleware, (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "City ID is required in URL parameters.",
                error: "Missing parameter"
            });
        }
        
        const weatherData = readWeatherData();
        
        // Find city index
        const cityIndex = weatherData.findIndex(city => city.id === id);
        
        if (cityIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Weather data with ID '${id}' not found.`,
                error: "City not found"
            });
        }
        
        // Get city data before deletion for response
        const deletedCity = weatherData[cityIndex];
        
        // Remove city from array
        weatherData.splice(cityIndex, 1);
        
        // Save to file
        const saveSuccess = writeWeatherData(weatherData);
        
        if (!saveSuccess) {
            return res.status(500).json({
                success: false,
                message: "Failed to delete weather data.",
                error: "Database error"
            });
        }
        
        res.status(200).json({
            success: true,
            message: "Weather data deleted successfully.",
            deletedData: deletedCity
        });
        
    } catch (error) {
        console.error('Error in DELETE /weather/:id:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error occurred.",
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Weather API is running successfully.",
        timestamp: new Date().toISOString(),
        endpoints: {
            "POST /weather": "Add weather data for a city",
            "GET /weather": "Get all cities (admin only)",
            "GET /weather/search": "Search weather by city name",
            "PUT /weather/:id": "Update weather data (admin only)",
            "DELETE /weather/:id": "Delete weather data (admin only)"
        }
    });
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found.",
        error: "Route not found",
        requestedUrl: req.originalUrl,
        method: req.method,
        availableEndpoints: {
            "POST /weather": "Add weather data for a city",
            "GET /weather": "Get all cities (admin only)",
            "GET /weather/search": "Search weather by city name",
            "PUT /weather/:id": "Update weather data (admin only)",
            "DELETE /weather/:id": "Delete weather data (admin only)",
            "GET /health": "Health check"
        }
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        success: false,
        message: "Something went wrong on the server.",
        error: error.message
    });
});

// Initialize database and start server
initializeDatabase();

app.listen(PORT, () => {
    console.log(`Weather API server is running on port ${PORT}`);
    console.log(`Server started at: ${new Date().toISOString()}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
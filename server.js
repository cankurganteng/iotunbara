const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- Variabel Global untuk Data Sensor, Status Pompa, dan Mode Kontrol ---
let latestSensorData = {
    temperature: null,
    humidity: null,
    soil_moisture_percentage_1: null, // Untuk sensor kelembaban tanah 1
    soil_moisture_percentage_2: null, // Untuk sensor kelembaban tanah 2
    timestamp: null,
    pump_actual_state: false // Status pompa aktual terakhir yang dikirim ESP32
};

// Mode kontrol saat ini: 'manual' atau 'autoFuzzy'
let controlMode = 'manual'; 

// Status pompa saat mode manual aktif. Ini adalah status yang diinginkan oleh backend.
let manualPumpStatus = false; // false = OFF, true = ON

// --- Endpoint untuk Menerima Data Sensor dari ESP32 (HTTP POST) ---
app.post('/api/sensor_data', (req, res) => {
    const { temperature, humidity, soil_moisture_percentage_1, soil_moisture_percentage_2, timestamp, pump_actual_state } = req.body;
    
    // Validasi dasar, pastikan data kelembaban tanah ada
    if (temperature != null && humidity != null && soil_moisture_percentage_1 != null && soil_moisture_percentage_2 != null) {
        latestSensorData = { 
            temperature, 
            humidity, 
            soil_moisture_percentage_1, 
            soil_moisture_percentage_2, 
            timestamp: new Date().toISOString(), // Gunakan waktu server untuk konsistensi
            pump_actual_state: typeof pump_actual_state === 'boolean' ? pump_actual_state : latestSensorData.pump_actual_state // Perbarui status aktual pompa
        };
        console.log('Received sensor data from ESP32:', latestSensorData);
        res.status(200).json({ message: 'Data sensor diterima', data: latestSensorData });
    } else {
        res.status(400).json({ message: 'Data sensor tidak lengkap' });
    }
});

// --- Endpoint untuk Mendapatkan Data Sensor Terbaru untuk Web (HTTP GET) ---
app.get('/api/sensor_data', (req, res) => {
    res.status(200).json(latestSensorData);
});

// --- Endpoint untuk Mengontrol Status Pompa dari Web (HTTP POST) ---
// Perintah ini hanya akan mempengaruhi manualPumpStatus jika mode kontrolnya manual
app.post('/api/pump_control', (req, res) => {
    const { status } = req.body; // Harapkan body seperti { "status": true } atau { "status": false }

    if (typeof status === 'boolean') {
        if (controlMode === 'manual') {
            manualPumpStatus = status;
            console.log(`Pump manual status updated to: ${manualPumpStatus ? 'ON' : 'OFF'}`);
            res.status(200).json({ 
                message: 'Perintah pompa manual diterima', 
                pump_status: manualPumpStatus, 
                control_mode: controlMode 
            });
        } else {
            console.log(`Pump manual control attempted while in ${controlMode} mode. Command ignored.`);
            res.status(403).json({ // Forbidden
                message: `Tidak dapat mengontrol pompa secara manual. Sistem dalam mode ${controlMode}.`, 
                current_pump_status: manualPumpStatus, 
                control_mode: controlMode 
            });
        }
    } else {
        res.status(400).json({ message: 'Status pompa tidak valid. Harapkan true/false.' });
    }
});

// --- Endpoint untuk ESP32 polling status pompa manual (HTTP GET) ---
// Ini adalah status pompa yang diinginkan oleh web jika mode manual aktif.
app.get('/api/pump_manual_status', (req, res) => {
    res.status(200).json({ pump_status: manualPumpStatus, control_mode: controlMode });
});

// --- Endpoint untuk Mendapatkan/Mengatur Mode Kontrol (Manual/Auto Fuzzy) ---
// GET: Untuk mengambil mode kontrol saat ini
app.get('/api/control_mode', (req, res) => {
    res.status(200).json({ mode: controlMode });
});

// POST: Untuk mengatur mode kontrol
app.post('/api/control_mode', (req, res) => {
    const { mode } = req.body; // Harapkan body seperti { "mode": "manual" } atau { "mode": "autoFuzzy" }

    if (mode === 'manual' || mode === 'autoFuzzy') {
        if (controlMode !== mode) { // Hanya update jika ada perubahan
            controlMode = mode;
            console.log(`Control mode updated to: ${controlMode}`);
            // Jika beralih ke mode otomatis, pastikan pompa manual dimatikan
            // untuk menghindari konflik jika sebelumnya ON
            if (controlMode === 'autoFuzzy') {
                manualPumpStatus = false; // Set status manual pompa ke OFF
                console.log('Switched to Auto Fuzzy mode, manual pump status reset to OFF.');
            }
        }
        res.status(200).json({ message: `Mode kontrol diatur ke ${controlMode}`, current_mode: controlMode });
    } else {
        res.status(400).json({ message: 'Mode kontrol tidak valid. Harapkan "manual" atau "autoFuzzy".' });
    }
});

// --- Mulai server ---
app.listen(port, () => {
    console.log(`IoT Backend Server listening at http://0.0.0.0:${port}`);
    console.log(`
        Frontend (Web) Endpoints:
        - GET  http://0.0.0.0:${port}/api/sensor_data       (Get latest sensor readings)
        - POST http://0.0.0.0:${port}/api/pump_control      (Control pump in manual mode, e.g., {"status": true/false})
        - GET  http://0.0.0.0:${port}/api/control_mode      (Get current control mode)
        - POST http://0.0.0.0:${port}/api/control_mode      (Set control mode, e.g., {"mode": "manual"/"autoFuzzy"})

        ESP32 Endpoints:
        - POST http://0.0.0.0:${port}/api/sensor_data       (Send sensor data)
        - GET  http://0.0.0.0:${port}/api/control_mode      (Get current control mode)
        - GET  http://0.0.0.0:${port}/api/pump_manual_status (Get desired manual pump status)
    `);
});

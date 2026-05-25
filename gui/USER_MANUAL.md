# User Manual: GPS-SDR-SIM Desktop Controller

Welcome to the **GPS-SDR-SIM Desktop Controller**. This manual will guide you through setting up and using the application to simulate high-fidelity GPS signals.

---

## 1. Getting Started

### Prerequisites
1.  **Node.js (v18+)**: To run the GUI and backend server.
2.  **C Compiler (GCC)**: Required to build the engine (`gpssim.c`).
3.  **SDR Drivers**: Ensure `hackrf_transfer` is in your PATH if using HackRF.
4.  **MATLAB (Optional)**: For automated receiver verification.

### Initial Setup
Ensure the simulation engine is compiled:
```bash
cd gps-sdr-sim
gcc gpssim.c getopt.c -lm -O3 -o gps-sdr-sim.exe
```

---

## 2. Navigating the Interface

### The Main Map
*   **Targeting**: Click anywhere on the map to set your simulation center.
*   **Search**: Use the top search bar to jump to specific addresses or cities.
*   **Marker**: A red marker indicates the current simulation target. A blue marker appears after MATLAB verification to show the solved position.

### The Control Panel (Right)
*   **Mode Toggles**: Switch between Static (fixed point) and Dynamic (trajectory).
*   **File Uploads**: Drag and drop RINEX ephemeris or Motion CSV files.
*   **SDR Presets**: Select your hardware (HackRF, PlutoSDR, etc.) to auto-configure bit depth and sample rates.
*   **Engine Log**: Monitor real-time terminal output with auto-scrolling feedback.

### The Picture-in-Picture (PiP) Window
Hover over the bottom-left window to toggle between:
1.  **Mini Map**: Focused view of your selected location/path.
2.  **Sky View**: Live polar plot showing satellite positions (Az/El) based on your selected time and location.

---

## 3. Core Scenarios

### Scenario A: Static Position (Fixed Point)
1.  Search for a location (e.g., "Grand Canyon").
2.  Set **Motion Mode** to `Static`.
3.  Upload your **RINEX File**.
4.  Click **Match File** to extract the exact GPS start time from the RINEX header.
5.  Click **Generate GPS Signal**.

### Scenario B: Drawing a Custom Route
1.  Set **Motion Mode** to `Dynamic`.
2.  Click **Draw Custom Route** in the toolbar.
3.  Click consecutive points on the map to define your path.
4.  Click **Finish Drawing** to save the trajectory.
5.  Click **Generate GPS Signal**.

### Scenario C: Auto-Circular Trajectory
1.  Place a marker on the map.
2.  Set **Motion Mode** to `Dynamic`.
3.  Click **Auto-Generate Trajectory**. The app will create a 100m radius circle around your point.
4.  Click **Generate GPS Signal**.

---

## 4. Advanced Tools

### The SkyView Engine
The SkyView uses a built-in Keplerian propagator. It parses your uploaded RINEX file and computes where every satellite is in the sky *before* you run the simulation. 
*   **Green SVs**: Visible (Elevation > 5°).
*   **Grey SVs**: Below the horizon.

### Automated Verification
After generating a signal, use the verification buttons:
*   **Verify with MATLAB**: Launches MATLAB, runs tracking loops, and displays the "Solved Position" on your map.
*   **Process with PocketSDR**: Uses the PocketSDR suite to validate the bitstream integrity.

---

## 5. Troubleshooting

| Symptom | Solution |
| :--- | :--- |
| **"Trajectory file not found"** | In Dynamic mode, you must draw, generate, or upload a CSV before clicking Generate. |
| **"HackRF Timeout"** | Check your USB connection. The app waits 30s before killing the transmission process. |
| **Wrong simulation time** | Always use "Match File" after uploading a RINEX file to ensure the simulator doesn't run with stale timestamps. |
| **SkyView is empty** | Ensure you have uploaded a valid RINEX file and set a simulation time. |

---

## 6. Regulatory Note
**Transmission Warning**: Only transmit synthesized GNSS signals using SDR hardware in a controlled, legal environment. Unauthorized transmission on GNSS bands is illegal and dangerous to aviation and emergency services.

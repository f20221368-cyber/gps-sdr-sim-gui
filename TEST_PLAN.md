# GNSS Simulation GUI — Comprehensive Test Plan

This document outlines the step-by-step procedures to verify the functionality of every feature in the GNSS Simulation GUI.

---

## 1. Application Launch & UI Health
- **Step 1:** Run `npm run electron:dev`.
- **Step 2:** Verify the window opens and the map loads.
- **Step 3:** Open DevTools (`Ctrl+Shift+I`). (Note: Minor Vite warnings are normal; ensure no fatal red errors).
- **Expected Output:** Interface shows Map (left), Control Panel (right), and PiP window (bottom-left).

---

## 2. Map & Location Selection
- **Step 1:** Click any location on the map.
- **Step 2:** Type a city name into the search bar and select a result.
- **Expected Output:** A **red marker** is placed on the exact coordinates for the selected target.

---

## 3. RINEX Parsing & Time Matching
- **Step 1:** Click "Upload RINEX" and select a `.n` or `.rnx` file.
- **Step 2:** Click **Match File** next to the Time input.
- **Expected Output:** Green toast notification appears. The input field populates with the first **GPS (`G`)** epoch record found in the file.

---

## 4. SkyView Satellite Geometry
- **Step 1:** Select a location and a valid Simulation Time.
- **Step 2:** Toggle the PiP window to "Sky View".
- **Expected Output:** The canvas renders green dots representing the GPS constellation at that specific time and coordinate.

---

## 5. Signal Generation
- **Static Mode:** Place marker -> Static Mode -> Generate. Output saved to `temp/gpssim.bin`.
- **Auto-Trajectory:** Place marker -> Dynamic Mode -> Auto-Generate Trajectory. Red circular path appears.
- **Manual Drawing:** Dynamic Mode -> Draw Custom Route -> Click points -> Finish Drawing. Path converts to red dots.
- **Expected Output:** Engine log auto-scrolls with real-time status. Success toast appears on completion.

---

## 6. Verification Pipelines
- **MATLAB Verification:** Click "Verify with MATLAB". MATLAB launches and plots acquisition loops. A **blue marker** appears on the map showing the receiver's solved solution.
- **PocketSDR:** Select "Process with PocketSDR" action. Modal displays processing results after generation.
- **Hardware Transmit:** Transmit via HackRF. If unplugged, the app waits 30s before alerting the user of a timeout.

---

## 7. UX & Polish
- **Toasts:** All success/error messages should appear as non-blocking toasts.
- **Auto-Scroll:** The terminal log must always scroll to the latest engine output automatically.

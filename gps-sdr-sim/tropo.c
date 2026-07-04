#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include "gpssim.h"
#include "tropo.h"

// Standard PI macro if not defined in math.h
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif


/**
 * Helper function to perform linear interpolation for the B coefficient
 * based on the standard Saastamoinen look-up table.
 * @param height_km Receiver height above sea level in kilometers.
 */

 // --- Table 1: B Coefficient Lookup Axis & Values ---
 
static const double HEIGHT_AXIS_B[] = { 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0 };
static const int HEIGHT_SIZE_B = 9;
static const double B_TABLE[] = { 1.156, 1.079, 1.006, 0.938, 0.874, 0.813, 0.757, 0.654, 0.563 };


// --- Table 2: Delta R Lookup Axes & Matrix ---
// Column headers representing Station Height Above Sea Level for Delta R
static const double HEIGHT_AXIS_DR[] = { 0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0 };
static const int HEIGHT_SIZE_DR = 8;

// Row headers representing Apparent Zenith Distance in degrees
static const double ZENITH_AXIS[] = {
    60.0, 66.0, 70.0, 73.0, 75.0, 76.0, 77.0, 78.0, 78.5, 79.0, 79.5, 79.75, 80.0
};
static const int ZENITH_SIZE = 13;

// Delta R Matrix matching ZENITH_AXIS rows and HEIGHT_AXIS_DR columns
static const double DELTA_R_MATRIX[13][8] = {
    {0.003, 0.003, 0.002, 0.002, 0.002, 0.002, 0.001, 0.001}, // 60 deg
    {0.006, 0.006, 0.005, 0.005, 0.004, 0.003, 0.003, 0.002}, // 66 deg
    {0.012, 0.011, 0.010, 0.009, 0.008, 0.006, 0.005, 0.004}, // 70 deg
    {0.020, 0.018, 0.017, 0.015, 0.013, 0.011, 0.009, 0.007}, // 73 deg
    {0.031, 0.028, 0.025, 0.023, 0.021, 0.017, 0.014, 0.011}, // 75 deg
    {0.039, 0.035, 0.032, 0.029, 0.026, 0.021, 0.017, 0.014}, // 76 deg
    {0.050, 0.045, 0.041, 0.037, 0.033, 0.027, 0.022, 0.018}, // 77 deg
    {0.065, 0.059, 0.054, 0.049, 0.044, 0.036, 0.030, 0.024}, // 78 deg
    {0.075, 0.068, 0.062, 0.056, 0.051, 0.042, 0.034, 0.028}, // 78°30' (78.5)
    {0.087, 0.079, 0.072, 0.065, 0.059, 0.049, 0.040, 0.033}, // 79 deg
    {0.102, 0.093, 0.085, 0.077, 0.070, 0.058, 0.047, 0.039}, // 79°30' (79.5)
    {0.111, 0.101, 0.092, 0.083, 0.076, 0.063, 0.052, 0.043}, // 79°45' (79.75)
    {0.121, 0.110, 0.100, 0.091, 0.083, 0.068, 0.056, 0.047}  // 80 deg
};

/**
 * Interpolate B coefficient
 */
double interpolate_B(double *llh) 
{
    double height_km = llh[2]/1000.0; // Extract height from LLH array

    if (height_km <= HEIGHT_AXIS_B[0]) return B_TABLE[0];
    if (height_km >= HEIGHT_AXIS_B[HEIGHT_SIZE_B - 1]) return B_TABLE[HEIGHT_SIZE_B - 1];

    for (int i = 0; i < HEIGHT_SIZE_B - 1; i++) {
        if (height_km >= HEIGHT_AXIS_B[i] && height_km <= HEIGHT_AXIS_B[i + 1]) {
            double fraction = (height_km - HEIGHT_AXIS_B[i]) / (HEIGHT_AXIS_B[i + 1] - HEIGHT_AXIS_B[i]);
            return B_TABLE[i] + fraction * (B_TABLE[i + 1] - B_TABLE[i]);
        }
    }
    return B_TABLE[0];
}

/**
 * 2D Bilinear Interpolation for delta_R (Safely drops back to the clean 8-column matrix)
 */
double interpolate_delta_R(double *azel, double *llh) 
{
    double height_km = llh[2] / 1000.0; // Extract height from LLH array
	double zenith_deg = ((M_PI / 2.0) - (azel[1]))* (180.0 / M_PI); // Convert elevation to zenith angle

    // 1. Clamp parameters securely within bounds
    if (height_km < HEIGHT_AXIS_DR[0]) height_km = HEIGHT_AXIS_DR[0];
    if (height_km > HEIGHT_AXIS_DR[HEIGHT_SIZE_DR - 1]) height_km = HEIGHT_AXIS_DR[HEIGHT_SIZE_DR - 1];

    if (zenith_deg < ZENITH_AXIS[0]) return 0.0; // Negligible correction below 60 degrees zenith
    if (zenith_deg > ZENITH_AXIS[ZENITH_SIZE - 1]) zenith_deg = ZENITH_AXIS[ZENITH_SIZE - 1];

    // 2. Find bounding width elements for height axis (0 to 5 km)
    int h_idx = 0;
    for (int i = 0; i < HEIGHT_SIZE_DR - 1; i++) {
        if (height_km >= HEIGHT_AXIS_DR[i] && height_km <= HEIGHT_AXIS_DR[i + 1]) {
            h_idx = i;
            break;
        }
    }

    // 3. Find bounding height elements for zenith axis (60 to 80 deg)
    int z_idx = 0;
    for (int j = 0; j < ZENITH_SIZE - 1; j++) {
        if (zenith_deg >= ZENITH_AXIS[j] && zenith_deg <= ZENITH_AXIS[j + 1]) {
            z_idx = j;
            break;
        }
    }

    // 4. Compute linear location factor variables (fractions)
    double t_h = (height_km - HEIGHT_AXIS_DR[h_idx]) / (HEIGHT_AXIS_DR[h_idx + 1] - HEIGHT_AXIS_DR[h_idx]);
    double t_z = (zenith_deg - ZENITH_AXIS[z_idx]) / (ZENITH_AXIS[z_idx + 1] - ZENITH_AXIS[z_idx]);

    // 5. Gather current bounding node values
    double q11 = DELTA_R_MATRIX[z_idx][h_idx];       // Top-Left
    double q21 = DELTA_R_MATRIX[z_idx][h_idx + 1];     // Top-Right
    double q12 = DELTA_R_MATRIX[z_idx + 1][h_idx];     // Bottom-Left
    double q22 = DELTA_R_MATRIX[z_idx + 1][h_idx + 1];   // Bottom-Right

    // 6. Bilinear evaluation
    double r1 = (1.0 - t_h) * q11 + t_h * q21;
    double r2 = (1.0 - t_h) * q12 + t_h * q22;

    return (1.0 - t_z) * r1 + t_z * r2;
}

// --- Internal State Variables (Saved from GUI via gpssim.c) ---
static tropo_model_t current_model = TROPO_NONE;
static double gui_P = 1013.25; // Default standard pressure
static double gui_T = 288.15;  // Default standard temperature (Kelvin)
static double gui_e = 11.0;    // Default partial water vapor pressure


// --- Setters called by gpssim.c at startup ---
void set_tropo_environmental_inputs(double P, double T, double e) 
{
    gui_P = P;
    gui_T = T;
    gui_e = e;
}

void set_tropo_model(tropo_model_t model) 
{
    current_model = model;
}

/**
 * Calculates total tropospheric path delay using the modified Saastamoinen equation.
 * * @param zenith_angle_deg Zenith angle of the satellite in degrees (90 - elevation)
 * @param P                Atmospheric pressure at the receiver in hPa/mbar
 * @param T                Temperature at the receiver in Kelvin
 * @param e                Partial water vapor pressure at the receiver in hPa/mbar
 * @param height_km        Receiver height above sea level in kilometers
 * @return                 Total tropospheric path delay in meters
 */
double calculate_saastamoinen_delay(double *azel, double *llh) 
{
    double height_km = llh[2] / 1000.0; // Convert altitude from meters to kilometers
	double z= (M_PI/2.0) - (azel[1]); // Convert elevation to zenith angle
	if (azel[1] < 15.0 * (M_PI / 180.0)) 
    {
		// For low elevation angles, apply a simple mapping function to avoid singularities
		z = (M_PI / 2.0) - (15.0 * (M_PI / 180.0)); // Cap at 15 degrees elevation
	}

    // 2. Compute trigonometric components
    double cos_z = cos(z);
    double tan_z = tan(z);

    // Guard against edge case where satellite is at/below horizon to avoid division by zero
    if (cos_z <= 0.001) {
        return 0.0;
    }

    // 3. Interpolate the B coefficient from the height table,Compute delta_R using bilinear interpolation
    double B = interpolate_B(llh);
    double delta_R = interpolate_delta_R(azel, llh);

    // 4. Evaluate the bracketed core expression: [P + (1255/T + 0.05)*e - B*tan^2(z)]
    double bracket_term = gui_P + ((1255.0 / gui_T) + 0.05) * gui_e - (B * tan_z * tan_z);

    // 5. Combine everything into the final path delay delta
    double saas_delta = (2.277e-3 / cos_z) * bracket_term + delta_R;

    return saas_delta;
}

/**
 * Calculates the tropospheric delay using the NATO STANAG 4294 model.
 * * @param elevation_deg  Satellite elevation angle in degrees (-90.0 to 90.0)
 * @param height_km      Station height above sea level in kilometers
 * @return               Total tropospheric path delay in meters
 */
double calculate_stanag_delay(double *azel, double *llh) {
    
	double elevation_deg = azel[1] * (180.0/M_PI); // Convert elevation from radians to degrees
	double height_km = llh[2] / 1000.0; // Convert altitude from meters to kilometers

    // 1. Enforce an elevation mask. If satellite is below horizon, return 0 or clamp.
    if (elevation_deg < 0.0) {
        return 0.0;
    }

    // 2. Convert elevation angle to radians for standard C math functions
    double elevation_rad = elevation_deg * (M_PI / 180.0);

    // 3. Compute the mapping function denominator
    double mapping_factor = sin(elevation_rad) + 0.025;

    // 4. Compute the height profile exponential decay
    double height_decay = exp(-0.1334 * height_km);

    // 5. Calculate total slant delay
    double stanag_delay = (2.4225 / mapping_factor) * height_decay;

    return stanag_delay;
}

double calculate_tropo_delay(double *azel, double *llh) 
{
    switch (current_model) 
    {
    case TROPO_SAASTAMOINEN:   // Case 1
        return calculate_saastamoinen_delay(azel, llh);

    case TROPO_STANAG:         // Case 2
        return calculate_stanag_delay(azel, llh);

    case TROPO_NONE:           // Case 0
    default:
        return 0.0;
    }
}
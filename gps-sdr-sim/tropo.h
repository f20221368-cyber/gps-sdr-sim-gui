#ifndef TROPO_H
#define TROPO_H

typedef enum {
    TROPO_NONE = 0,
    TROPO_SAASTAMOINEN = 1,
    TROPO_STANAG = 2
} tropo_model_t;

// Unified wrapper function to compute the chosen tropospheric delay
double calculate_tropo_delay(double *azel, double *llh, tropo_model_t model);


// Function prototype for the Saastamoinen model
double calculate_saastamoinen_delay(double *azel, double *llh);

// Function prototype for the STANAG model
double calculate_stanag_delay(double *azel, double *llh);

#endif
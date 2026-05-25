import adi
import numpy as np
import matplotlib.pyplot as plt
import time
import sys


def show_usage():
    print(
        'Usage: pluto_dump.py [-sig sig] [-f freq] [-t tsec] [-gain rx] [-p] file')


def sig_freq(sig):
    sig = sig.upper()
    if sig == 'L1CA':
        return 1575.42e6
    elif sig == 'I5S':
        return 1176.45e6
    elif sig == 'ISS':
        return 2492.028e6
    else:
        return 0.0


if __name__ == '__main__':
    sig = 'L1CA'
    center_freq = 0.0  # center frequency in Hz
    sample_rate = 4e6  # sample rate in Hz
    tsec = 0.01  # sampling time in sec [10ms]
    gain = -1.0  # rx gain in dB [AGC]
    opt = False
    file = ''

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '-sig':
            i += 1
            sig = sys.argv[i]
        elif sys.argv[i] == '-f':
            i += 1
            sample_rate = float(sys.argv[i]) * 1e6
        elif sys.argv[i] == '-t':
            i += 1
            tsec = float(sys.argv[i])
        elif sys.argv[i] == '-gain':
            i += 1
            gain = float(sys.argv[i])
        elif sys.argv[i] == '-p':
            opt = True
        elif sys.argv[i] == '-h':
            show_usage()
            exit()
        else:
            file = sys.argv[i]
        i += 1

    if file == '':
        print('Specify output file.')
        exit()

    center_freq = sig_freq(sig)
    if center_freq <= 0.0:
        print('Invalid signal %s.' % (sig))
        exit()

    sdr = adi.Pluto("ip:192.168.2.1")
    sdr.sample_rate = int(sample_rate)
    sdr.rx_rf_bandwidth = int(sample_rate)
    sdr.rx_lo = int(center_freq)
    sdr.rx_buffer_size = int(sample_rate * tsec)

    if gain < 0.0:
        sdr.gain_control_mode_chan0 = "fast_attack"  # set AGC mode
        # sdr.gain_control_mode_chan0 = "slow_attack" # set AGC mode
    else:
        if gain > 71:
            gain = 71
        sdr.gain_control_mode_chan0 = "manual"  # turn off AGC
        sdr.rx_hardwaregain_chan0 = gain  # allowable range is 0 to 71 dB
        # https://wiki.analog.com/resources/tools-software/linux-drivers/iio-transceiver/ad9361#rx_gain_control

    # Clear buffer just to be safe
    for i in range(0, 3):
        raw_data = sdr.rx()

    start_time = time.time()

    rx_samples = sdr.rx()

    end_time = time.time()

    print('TIME = %.3f s' % (end_time - start_time))

    # Save I/Q samples in sc16 format
    iq_samp_int16 = np.stack([np.real(rx_samples).astype(
        np.int16), np.imag(rx_samples).astype(np.int16)], 1)

    fid = open(file, "wb")
    iq_samp_int16.tofile(fid)
    fid.close()

    # if opt:
    #     # Plot time domain
    #     plt.figure(0)
    #     plt.plot(np.real(rx_samples[::100]))
    #     plt.plot(np.imag(rx_samples[::100]))
    #     plt.xlabel("Samples")
    #     plt.ylabel("Amplitude")

    #     # Plot histogram
    #     fig = plt.figure(1)
    #     ax1 = fig.add_subplot(2, 1, 1)
    #     ax2 = fig.add_subplot(2, 1, 2)
    #     ax1.hist(np.real(rx_samples[::100]), bins = 16)
    #     ax2.hist(np.imag(rx_samples[::100]), bins = 16)

    #     # Calculate power spectral density
    #     psd = np.abs(np.fft.fftshift(np.fft.fft(rx_samples)))**2
    #     psd_dB = 10*np.log10(psd)
    #     f = np.linspace(sample_rate/-2, sample_rate/2, len(psd))

    #     plt.figure(2)
    #     plt.plot(f/1e6, psd_dB)
    #     plt.xlabel("Frequency [MHz]")
    #     plt.ylabel("PSD")
    #     plt.title('SIG = %s, FILE = %s' % (sig, file))
    #     plt.show()

% function acqResults = acquisition(longSignal, settings)
% % Function performs cold start acquisition on the collected "data". It
% % searches for GPS signals of all satellites, which are listed in field
% % "acqSatelliteList" in the settings structure. Function saves code phase
% % and frequency of the detected signals in the "acqResults" structure.
% 
% %% Initialization ===================================================
% %--- Variables for coarse acquisition -------------------------------------
% samplesPerCode = round(settings.samplingFreq / (settings.codeFreqBasis / settings.codeLength));
% ts = 1 / settings.samplingFreq;
% phasePoints = (0 : (samplesPerCode * 2 - 1)) * 2 * pi * ts;
% 
% numberOfFreqBins = round(settings.acqSearchBand * 2 / settings.acqSearchStep) + 1;
% coarseFreqBin = zeros(1, numberOfFreqBins);
% 
% acqResults.carrFreq = zeros(1, 32);
% acqResults.codePhase = zeros(1, 32);
% acqResults.peakMetric = zeros(1, 32);
% 
% fineSearchStep = 25;
% numOfFineBins = round(settings.acqSearchStep / fineSearchStep) + 1;
% fineFreqBins = zeros(1, numOfFineBins);
% fineResult = zeros(1, numOfFineBins);
% sumPerCode = zeros(1, 40);
% finePhasePoints = (0 : (40 * samplesPerCode - 1)) * 2 * pi * ts;
% 
% % Correct signal power calculation: Use the variance over the whole signal
% sigPower = mean(abs(longSignal).^2);  % Mean squared amplitude of the signal
% 
% % Perform search for all listed PRN numbers ...
% fprintf('(');
% signalLen = length(longSignal);
% longSignal = [longSignal zeros(1, signalLen)];  % Zero-padding the signal to twice the length
% 
% for PRN = settings.acqSatelliteList
%     %% Coarse acquisition ===========================================
%     % Generate C/A codes and sample them according to the sampling freq.
%     caCodesTable = makeCaTable(PRN, settings);
%     caCodes2ms = [caCodesTable zeros(1, samplesPerCode)];  % Apply zero-padding to C/A code
% 
%     % Frequency domain correlation with padded signals
%     results = zeros(numberOfFreqBins, samplesPerCode * 2 );  % Two times padded length
% 
%     % DFT of C/A code with zero-padding
%     caCodeFreqDom = conj(fft(caCodes2ms, length(caCodes2ms)));  % Zero-padded DFT of C/A code
% 
%     for freqBinIndex = 1:numberOfFreqBins
%         coarseFreqBin(freqBinIndex) = settings.IF + settings.acqSearchBand - settings.acqSearchStep * (freqBinIndex - 1);
%         sigCarr = exp(-1i * coarseFreqBin(freqBinIndex) * phasePoints);  % Carrier signal for Doppler shift
% 
%         for nonCohIndex = 1:settings.acqNonCohTime
%             % Split the signal into two blocks for FFT processing
%             signal = longSignal((nonCohIndex - 1) * samplesPerCode + 1 : (nonCohIndex + 1) * samplesPerCode);
%             N = length(signal);
%             signalBlock1 = signal(1:N/2);  % First half
%             signalBlock2 = signal(N/2 + 1:end);  % Second half
% 
%             % Zero padding each signal block
%             zeroPad1 = [signalBlock1 zeros(1, N/2)];  % Zero padding the first block
%             zeroPad2 = [signalBlock2 zeros(1, N/2)];  % Zero padding the second block
% 
%             % Perform FFT on zero-padded blocks
%             FFTBlock1 = fft(zeroPad1);  
%             FFTBlock2 = fft(zeroPad2);  
% 
%             % Perform frequency domain correlation using the FFT of the blocks and C/A code
%             convCodeIQ = FFTBlock1 .* conj(FFTBlock2) .* caCodeFreqDom.*sigCarr;  % Multiply with conjugate of the C/A code's FFT
%             cohRresult = abs(ifft(convCodeIQ));  % Inverse FFT to get correlation in time domain
%             
%             % Accumulate the correlation result over multiple non-coherent integrations
%             results(freqBinIndex, :) = results(freqBinIndex, :) + cohRresult;
%         end
%     end
% 
%     %% Look for correlation peaks for coarse acquisition ================
%     [~, acqCoarseBin] = max(max(results, [], 2));  % Find the bin with max correlation
%     [peakSize, codePhase] = max(max(results));  % Find peak correlation and its corresponding code phase
%     samplesPerCodeChip   = round(settings.samplingFreq / settings.codeFreqBasis);
%     excludeRangeIndex1 = codePhase - samplesPerCodeChip;
%     excludeRangeIndex2 = codePhase + samplesPerCodeChip;
% 
%     %--- Correct C/A code phase exclude range if the range includes array
%     %boundaries
%     if excludeRangeIndex1 < 2
%         codePhaseRange = excludeRangeIndex2 : ...
%                          (samplesPerCode + excludeRangeIndex1);
%                          
%     elseif excludeRangeIndex2 >= samplesPerCode
%         codePhaseRange = (excludeRangeIndex2 - samplesPerCode) : ...
%                          excludeRangeIndex1;
%     else
%         codePhaseRange = [1:excludeRangeIndex1, ...
%                           excludeRangeIndex2 : samplesPerCode];
%     end
% 
%     %--- Find the second highest correlation peak in the same freq. bin ---
%     secondPeakSize = max(results(acqCoarseBin, codePhaseRange));
% 
%     %--- Store result -----------------------------------------------------
%     acqResults.peakMetric(PRN) = peakSize/secondPeakSize;
% 
% %     acqResults.peakMetric(PRN) = peakSize / sigPower / settings.acqNonCohTime;  % Normalize peak metric
% 
%     if acqResults.peakMetric(PRN) > settings.acqThreshold
%         fprintf('%02d ', PRN);
%         disp(acqResults.peakMetric(PRN));
% 
%         %% Fine carrier frequency search ============================
%         % Prepare 20ms code, carrier, and input signals for fine search
%         caCode = generateCAcode(PRN);
%         codeValueIndex = floor((ts * (0 : 40 * samplesPerCode - 1)) / (1 / settings.codeFreqBasis));
%         caCode40ms = caCode(rem(codeValueIndex, settings.codeLength) + 1);
% 
%         sig40cm = longSignal(codePhase:codePhase + 40 * samplesPerCode - 1);
% 
%         for fineBinIndex = 1:numOfFineBins
%             fineFreqBins(fineBinIndex) = coarseFreqBin(acqCoarseBin) + settings.acqSearchStep / 2 - fineSearchStep * (fineBinIndex - 1);
%             sigCarr40cm = exp(-1i * fineFreqBins(fineBinIndex) * finePhasePoints);
%             basebandSig = sig40cm .* caCode40ms .* sigCarr40cm;
% 
%             for index = 1:40
%                 sumPerCode(index) = sum(basebandSig(samplesPerCode * (index - 1) + 1 : samplesPerCode * index));
%             end
% 
%             maxPower = 0;
%             for comIndex = 1:20
%                 comPower = abs(sum(sumPerCode(comIndex:comIndex+19)));
%                 maxPower = max(maxPower, comPower);
%             end
%             fineResult(fineBinIndex) = maxPower;
%         end
% 
%         [~, maxFinBin] = max(fineResult);
%         acqResults.carrFreq(PRN) = fineFreqBins(maxFinBin);
%         acqResults.codePhase(PRN) = codePhase;
% 
%         if acqResults.carrFreq(PRN) == 0
%             acqResults.carrFreq(PRN) = 1;
%         end
% 
%         %% Downsampling recovery ====================================
%         if (exist('oldFreq', 'var') && settings.resamplingflag == 1)
%             acqResults.codePhase(PRN) = floor((codePhase - 1) / settings.samplingFreq * oldFreq) + 1;
%             if (settings.IF >= settings.samplingFreq / 2)
%                 IF_temp = settings.samplingFreq - settings.IF;
%                 doppler = IF_temp - acqResults.carrFreq(PRN);
%             else
%                 doppler = acqResults.carrFreq(PRN) - settings.IF;
%             end
%             acqResults.carrFreq(PRN) = doppler + oldIF;
%         end
%     else
%         fprintf('. ');
%     end
% end
% 
% %=== Acquisition is over ==================================================
% fprintf(')\n');
% end





















% % % % % % DBZP + non COH FULL working
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
function acqResults = acquisition_dbzp_l1ca(longSignal, settings)
% Function performs cold start acquisition on the collected "data". It
% searches for GPS signals of all satellites, which are listed in field
% "acqSatelliteList" in the settings structure. Function saves code phase
% and frequency of the detected signals in the "acqResults" structure.
% 
% (Original function details omitted for brevity)
% 
% Condition input signal to speed up acquisition ===================
% 
% Resampling logic for speeding up acquisition is the same as before
% (kept as-is for brevity)

% Initialization ===================================================
% --- Variables for coarse acquisition -------------------------------------
samplesPerCode = round(settings.samplingFreq / (settings.codeFreqBasis / settings.codeLength));
ts = 1 / settings.samplingFreq;
phasePoints = (0 : (samplesPerCode * 2 - 1)) * 2 * pi * ts;

numberOfFreqBins = round(settings.acqSearchBand * 2 / settings.acqSearchStep) + 1;
coarseFreqBin = zeros(1, numberOfFreqBins);

acqResults.carrFreq = zeros(1, 32);
acqResults.codePhase = zeros(1, 32);
acqResults.peakMetric = zeros(1, 32);

fineSearchStep = 25;
numOfFineBins = round(settings.acqSearchStep / fineSearchStep) + 1;
fineFreqBins = zeros(1, numOfFineBins);
fineResult = zeros(1, numOfFineBins);
sumPerCode = zeros(1, 40);
finePhasePoints = (0 : (40 * samplesPerCode - 1)) * 2 * pi * ts;

sigPower = sqrt(var(longSignal(1:samplesPerCode)) * samplesPerCode);

% Perform search for all listed PRN numbers ...
fprintf('(');
signalLen = length(longSignal);
longSignal = [longSignal zeros(1, signalLen)];
% longSignal2=fft(longSignal1);
% longSignal2=[longSignal2, fft(zeros(1, length(longSignal2)))];
% longSignal=ifft(longSignal2);

for PRN = settings.acqSatelliteList
    %% Coarse acquisition ===========================================
    % Generate C/A codes and sample them according to the sampling freq.
    caCodesTable = makeCaTable(PRN, settings);
    caCodes2ms = [caCodesTable zeros(1, samplesPerCode)]; % Apply zero-padding

    % Zero-padding the input signal
    % Apply zero-padding to the signal

    % Frequency domain correlation with padded signals
    results = zeros(numberOfFreqBins, samplesPerCode * 2);

    % DFT of C/A code with zero-padding
    caCodeFreqDom = conj(fft(caCodes2ms)); % Zero-padded DFT of C/A code
%     caCodeFreqDom=[zeros(1, samplesPerCode) caCodeFreqDom zeros(1, samplesPerCode)];
    for freqBinIndex = 1:numberOfFreqBins
        coarseFreqBin(freqBinIndex) = settings.IF + settings.acqSearchBand - settings.acqSearchStep * (freqBinIndex - 1);
        sigCarr = exp(-1i * coarseFreqBin(freqBinIndex) * phasePoints);

        for nonCohIndex = 1:settings.acqNonCohTime
            signal = longSignal((nonCohIndex - 1) * samplesPerCode + 1 : (nonCohIndex + 1) * samplesPerCode);
            I = real(sigCarr .* signal);
            Q = imag(sigCarr .* signal);
            IQfreqDom = fft(I + 1i * Q); 

%             IQfreqDom=[zeros(1, samplesPerCode) IQfreqDom zeros(1, samplesPerCode)];
            

            convCodeIQ = IQfreqDom .* caCodeFreqDom; % Frequency domain correlation
            cohRresult = abs(ifft(convCodeIQ)); % Inverse DFT to get correlation in time domain
            results(freqBinIndex, :) = results(freqBinIndex, :) + cohRresult;
        end
    end

    %% Look for correlation peaks for coarse acquisition ============
    [~, acqCoarseBin] = max(max(results, [], 2));
    [peakSize, codePhase] = max(max(results));
    samplesPerCodeChip   = round(settings.samplingFreq / settings.codeFreqBasis);
    excludeRangeIndex1 = codePhase - samplesPerCodeChip;
    excludeRangeIndex2 = codePhase + samplesPerCodeChip;

    %--- Correct C/A code phase exclude range if the range includes array
    %boundaries
    if excludeRangeIndex1 < 2
        codePhaseRange = excludeRangeIndex2 : ...
                         (samplesPerCode + excludeRangeIndex1);
                         
    elseif excludeRangeIndex2 >= samplesPerCode
        codePhaseRange = (excludeRangeIndex2 - samplesPerCode) : ...
                         excludeRangeIndex1;
    else
        codePhaseRange = [1:excludeRangeIndex1, ...
                          excludeRangeIndex2 : samplesPerCode];
    end

    %--- Find the second highest correlation peak in the same freq. bin ---
    secondPeakSize = max(results(acqCoarseBin, codePhaseRange));

    %--- Store result -----------------------------------------------------
    acqResults.peakMetric(PRN) = peakSize/secondPeakSize;

%     acqResults.peakMetric(PRN) = peakSize / sigPower / settings.acqNonCohTime;

    if acqResults.peakMetric(PRN) > settings.acqThreshold
        fprintf('%02d ', PRN);
        disp(acqResults.peakMetric(PRN))

        %% Fine carrier frequency search ============================
        % Prepare 20ms code, carrier, and input signals for fine search
        caCode = generateCAcode(PRN);
        codeValueIndex = floor((ts * (0 : 40 * samplesPerCode - 1)) / (1 / settings.codeFreqBasis));
        caCode40ms = caCode(rem(codeValueIndex, settings.codeLength) + 1);

        sig40cm = longSignal(codePhase:codePhase + 40 * samplesPerCode - 1);

        for fineBinIndex = 1:numOfFineBins
            fineFreqBins(fineBinIndex) = coarseFreqBin(acqCoarseBin) + settings.acqSearchStep / 2 - fineSearchStep * (fineBinIndex - 1);
            sigCarr40cm = exp(-1i * fineFreqBins(fineBinIndex) * finePhasePoints);
            basebandSig = sig40cm .* caCode40ms .* sigCarr40cm;

            for index = 1:40
                sumPerCode(index) = sum(basebandSig(samplesPerCode * (index - 1) + 1 : samplesPerCode * index));
            end

            maxPower = 0;
            for comIndex = 1:20
                comPower = abs(sum(sumPerCode(comIndex:comIndex+19)));
                maxPower = max(maxPower, comPower);
            end
            fineResult(fineBinIndex) = maxPower;
        end

        [~, maxFinBin] = max(fineResult);
        acqResults.carrFreq(PRN) = fineFreqBins(maxFinBin);
        acqResults.codePhase(PRN) = codePhase;

        if acqResults.carrFreq(PRN) == 0
            acqResults.carrFreq(PRN) = 1;
        end

        %% Downsampling recovery ====================================
        if (exist('oldFreq', 'var') && settings.resamplingflag == 1)
            acqResults.codePhase(PRN) = floor((codePhase - 1) / settings.samplingFreq * oldFreq) + 1;
            if (settings.IF >= settings.samplingFreq / 2)
                IF_temp = settings.samplingFreq - settings.IF;
                doppler = IF_temp - acqResults.carrFreq(PRN);
            else
                doppler = acqResults.carrFreq(PRN) - settings.IF;
            end
            acqResults.carrFreq(PRN) = doppler + oldIF;
        end
    else
        fprintf('.');
    end
end

%=== Acquisition is over ==================================================
fprintf(')\n');
end


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%




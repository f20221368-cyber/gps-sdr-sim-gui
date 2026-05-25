%% Time specifications:
Fs = 10000;
dt = 1/Fs; StopTime = 0.5;
t = (0:dt:StopTime-dt)';
N = size(t,1);
Fc = 1000;
x = cos(2*pi*Fc*t);
subplot(2,1,1)
plot(t,x);
axis([0 1/100 -1 1]); xlabel('Time'); ylabel('Magnitude')
%% Fourier Transform:
X = fftshift(fft(x));
%% Frequency specifications:
dF = Fs/N;
f = -Fs/2:dF:Fs/2-dF;
%% Plot the spectrum: 
subplot(2,1,2) 
plot(f,abs(X)/N); 
xlabel('Frequency (inhertz)'); 
ylabel('Magnitude')
%%
%B. Square wave period = 1msec, amplitude = 1v
Fs = 1000000;
dt = 1/Fs;
StopTime = 0.5;
t = (0:dt:StopTime-dt)'; N = size(t,1);
Fc = 1000;
x = square(2*3.14*Fc*t);
subplot(2,1,1)
plot(t,x);
axis([0 1/200 -2 2]); xlabel('Time'); ylabel('Magnitude');
%%Fourier Transform:
X = fftshift(fft(x));
%%Frequency specifications:
dF = Fs/N;
f = -Fs/2:dF:Fs/2-dF;
%%Plot the spectrum:
subplot(2,1,2) 
plot(f,abs(X)/N); 
axis([-100000 100000 0 0.5]);
xlabel('Frequency (in hertz)');
ylabel('Magnitude');

Fs = 30000;
dt = 1/Fs;
StopTime = 0.5;
t = (0:dt:StopTime-dt)'; N = size(t,1);
Fc = 1000;
x = cos(2*pi*Fc*t); x=x.*x;
subplot(2,1,1)
plot(t,x);
xlabel('Time');
ylabel('Magnitude');
axis([0 1/100 -1 1]);
X = fftshift(fft(x));
dF = Fs/N;
f = -Fs/2:dF:Fs/2-dF; 
subplot(2,1,2) 
plot(f,abs(X)/N); 
axis([-5000 5000 0 0.75]) 
zoom on
xlabel('Frequency (in hertz)'); ylabel('Magnitude');
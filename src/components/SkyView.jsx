import React, { useEffect, useRef } from 'react';

const SkyView = ({ satellites = [], width = 400, height = 400 }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const radius = Math.min(width, height) / 2 - 30;
        const centerX = width / 2;
        const centerY = height / 2;

        const drawSky = () => {
            ctx.clearRect(0, 0, width, height);

            // 1. Draw outer dome with gradient
            const domeGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            domeGradient.addColorStop(0, '#111827');
            domeGradient.addColorStop(1, '#000000');
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = domeGradient;
            ctx.fill();
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 2. Elevation Rings
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
            [30, 60].forEach(deg => {
                const r = radius * (1 - deg / 90);
                ctx.beginPath();
                ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
                ctx.stroke();
                
                ctx.fillStyle = 'rgba(156, 163, 175, 0.5)';
                ctx.font = '10px "Fira Code", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${deg}°`, centerX, centerY - r + 12);
            });
            ctx.setLineDash([]);

            // 3. Axis / Crosshair
            ctx.beginPath();
            ctx.moveTo(centerX - radius, centerY); ctx.lineTo(centerX + radius, centerY);
            ctx.moveTo(centerX, centerY - radius); ctx.lineTo(centerX, centerY + radius);
            ctx.strokeStyle = 'rgba(55, 65, 81, 0.5)';
            ctx.stroke();

            // 4. Cardinal Directions
            ctx.font = 'bold 13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const labels = [
                { t: 'N', x: centerX, y: centerY - radius - 15, c: '#ef4444' },
                { t: 'S', x: centerX, y: centerY + radius + 15, c: '#9ca3af' },
                { t: 'E', x: centerX + radius + 15, y: centerY, c: '#9ca3af' },
                { t: 'W', x: centerX - radius - 15, y: centerY, c: '#9ca3af' }
            ];

            labels.forEach(l => {
                ctx.fillStyle = l.c;
                ctx.fillText(l.t, l.x, l.y);
            });

            // 5. Draw Satellites
            satellites.forEach(sat => {
                const r = radius * (1 - sat.elevation / 90);
                const angleRad = (sat.azimuth - 90) * (Math.PI / 180);
                const x = centerX + r * Math.cos(angleRad);
                const y = centerY + r * Math.sin(angleRad);

                // Satellite Glow / Pulse if visible
                if (sat.visible) {
                    const glow = ctx.createRadialGradient(x, y, 0, x, y, 15);
                    glow.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
                    glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(x, y, 15, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Sat Icon
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, 2 * Math.PI);
                ctx.fillStyle = sat.visible ? '#10b981' : '#374151';
                ctx.fill();
                ctx.strokeStyle = sat.visible ? '#fff' : '#6b7280';
                ctx.lineWidth = 1;
                ctx.stroke();

                // PRN Label
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px "Fira Code", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sat.prn, x, y);

                // Signal Strength Bar (simulated mockup based on elevation)
                if (sat.visible) {
                    const barH = Math.max(2, (sat.elevation / 90) * 12);
                    ctx.fillStyle = '#10b981';
                    ctx.fillRect(x - 6, y + 12, 12, 2);
                    ctx.fillRect(x - 6, y + 12 - barH, 2, barH);
                }
            });

            // Legend
            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`COUNT: ${satellites.filter(s => s.visible).length} SVs`, 10, height - 15);
        };

        drawSky();
    }, [satellites, width, height]);

    return (
        <div className="sky-view-container">
            <canvas 
                ref={canvasRef} 
                width={width} 
                height={height} 
                className="sky-canvas"
            />
        </div>
    );
};

export default SkyView;


import React, { useState } from 'react';

export default function SettingsPanel({ settings, setSettings }) {
  // Sub-navigation state for Global settings
  const [activeSubTab, setActiveSubTab] = useState('ATMOSPHERE');

  const handleValueChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value === '' ? '' : parseFloat(value)
    }));
  };

  return (
    <div className="settings-panel">
      <div className="panel-header">
        <h2>Global Settings</h2>
      </div>
      
      {/* Internal Sub-navigation Tabs */}
      <div className="settings-sub-nav">
        <button 
          className={activeSubTab === 'ATMOSPHERE' ? 'sub-btn active' : 'sub-btn'}
          onClick={() => setActiveSubTab('ATMOSPHERE')}
        >
          Atmosphere
        </button>
        {/* You can easily add more tabs here later like 'Earth Orientation' */}
      </div>

      <div className="settings-content-body">
        {activeSubTab === 'ATMOSPHERE' && (
          <div className="atmosphere-config">
            <h3>Atmosphere Settings (Nominal)</h3>
            <hr />

            <div className="form-group">
              <label htmlFor="tropo-model-select">Tropospheric Model</label>
              <select 
                id="tropo-model-select"
                value={settings.model} 
                onChange={(e) => handleValueChange('model', e.target.value)}
              >
                <option value={0}>None</option>
                <option value={1}>Saastamoinen</option>
                <option value={2}>NATO STANAG 4294</option>
              </select>
            </div>

            {/* Conditionally show parameter fields ONLY if Saastamoinen is active */}
            {Number(settings.model) === 1 ? (
              <div className="parameters-group field-fade-in">
                <h4>Saastamoinen Environment Coefficients</h4>
                
                <div className="form-group">
                  <label>Atmospheric Pressure (P) [hPa]</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="1013.25"
                    value={settings.pressure}
                    onChange={(e) => handleValueChange('pressure', e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Surface Temperature (T) [Kelvin]</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="288.15"
                    value={settings.temperature}
                    onChange={(e) => handleValueChange('temperature', e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Partial Water Vapor Pressure (e) [hPa]</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="11.0"
                    value={settings.waterVapor}
                    onChange={(e) => handleValueChange('waterVapor', e.target.value)} 
                  />
                </div>
              </div>
            ) : Number(settings.model) === 2 ? (
              <div className="model-notice field-fade-in">
                <p><em>STANAG 4294 uses standard altitude decay profiles. Surface parameters P, T, and e are omitted.</em></p>
              </div>
            ) : (
              <div className="model-notice field-fade-in">
                <p><em>Tropospheric delay is disabled. Simulated delay = 0.0m.</em></p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 
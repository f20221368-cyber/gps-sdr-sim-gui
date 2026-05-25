import React from 'react';

const ResultsModal = ({ isOpen, onClose, title, content, isError }) => {
  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    // Simple visual feedback could be added here
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className={`modal-status-indicator ${isError ? 'error' : 'success'}`}></span>
            <h2>{title || (isError ? 'Simulation Error' : 'Simulation Results')}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="results-container">
            <pre className="results-log">{content}</pre>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCopy}>
            Copy Results
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsModal;

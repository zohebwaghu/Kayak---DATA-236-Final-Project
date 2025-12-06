// src/pages/search/AiResultsPlaceholder.jsx
import React from 'react';

const AiResultsPlaceholder = ({ prompt }) => {
  // Nothing typed yet → gentle hint
  if (!prompt) {
    return (
      <div className="flights-results ai-results-placeholder">
        <div className="flights-loading">
          Start by describing a trip in AI Mode above – your AI itinerary
          will appear here.
        </div>
      </div>
    );
  }

  // Simple placeholder “AI result” for now
  return (
    <div className="flights-results ai-results-placeholder">
      <div className="flights-results-meta">
        AI ideas based on: “{prompt}”
      </div>

      <div className="flights-result-list">
        <div className="flight-card">
          <div className="flight-card-main">
            <div className="flight-card-route">
              Sample day-by-day plan (placeholder)
            </div>
            <div className="flight-card-meta">
              This is where your AI-generated itinerary, recommended cities,
              hotels, and flights will be rendered once the real AI backend is
              wired in.
            </div>
          </div>
          <div className="flight-card-price">✨ AI</div>
        </div>
      </div>
    </div>
  );
};

export default AiResultsPlaceholder;

// src/pages/search/AiResults.jsx
/**
 * AI Results Component
 * Displays AI-generated bundle recommendations
 * Replaces AiResultsPlaceholder with real data
 */

import React, { useState } from 'react';
import AiBundleCard from '../../components/ai/AiBundleCard';
import AiChangeHighlight from '../../components/ai/AiChangeHighlight';
import AiWatchesPanel from '../../components/ai/AiWatchesPanel';

const AiResults = ({
  bundles = [],
  loading = false,
  error = null,
  response = '',
  changes = null,
  suggestions = [],
  sessionId = null,
  onSuggestionClick,
  onWatchCreate,
  onAnalyzeClick,
  onQuoteClick,
  onBookClick,
  userId
}) => {
  const [showWatches, setShowWatches] = useState(false);

  // Loading state
  if (loading) {
    return (
      <div className="ai-results ai-results--loading">
        <div className="ai-loading-spinner">
          <div className="ai-spinner"></div>
          <p>AI is finding the best options for you...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="ai-results ai-results--error">
        <div className="ai-error-message">
          <i className="bi bi-exclamation-circle"></i>
          <p>{error}</p>
          <button 
            className="ai-retry-btn"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state - no query yet
  if (!bundles.length && !response) {
    return (
      <div className="ai-results ai-results--empty">
        <div className="ai-empty-state">
          <i className="bi bi-stars"></i>
          <h3>Describe your ideal trip</h3>
          <p>Tell AI what you're looking for and get personalized recommendations</p>
          <div className="ai-example-queries">
            <span>Try:</span>
            <button onClick={() => onSuggestionClick?.('Weekend trip to Miami under $800')}>
              Weekend trip to Miami under $800
            </button>
            <button onClick={() => onSuggestionClick?.('Family vacation with pool')}>
              Family vacation with pool
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Clarification response (no bundles yet)
  if (response && !bundles.length) {
    return (
      <div className="ai-results ai-results--clarification">
        <div className="ai-response-card">
          <div className="ai-response-icon">
            <i className="bi bi-chat-dots"></i>
          </div>
          <div className="ai-response-content">
            <p>{response}</p>
            {suggestions.length > 0 && (
              <div className="ai-suggestions">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    className="ai-suggestion-chip"
                    onClick={() => onSuggestionClick?.(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Results with bundles
  return (
    <div className="ai-results">
      {/* Response Header */}
      {response && (
        <div className="ai-response-header">
          <i className="bi bi-stars"></i>
          <span>{response}</span>
        </div>
      )}

      {/* Change Highlights (Refine without starting over) */}
      {changes && changes.length > 0 && (
        <AiChangeHighlight changes={changes} />
      )}

      {/* Results Meta */}
      <div className="ai-results-meta">
        <span className="ai-results-count">
          {bundles.length} option{bundles.length !== 1 ? 's' : ''} found
        </span>
        <button 
          className="ai-watches-toggle"
          onClick={() => setShowWatches(!showWatches)}
        >
          <i className="bi bi-bell"></i>
          My Watches
        </button>
      </div>

      {/* Watches Panel (collapsible) */}
      {showWatches && (
        <AiWatchesPanel 
          userId={userId}
          onClose={() => setShowWatches(false)}
        />
      )}

      {/* Bundle Cards */}
      <div className="ai-bundles-list">
        {bundles.map((bundle, index) => (
          <AiBundleCard
            key={bundle.bundle_id || index}
            bundle={bundle}
            rank={index + 1}
            onWatchClick={() => onWatchCreate?.(bundle)}
            onAnalyzeClick={() => onAnalyzeClick?.(bundle)}
            onQuoteClick={() => onQuoteClick?.(bundle)}
            onBookClick={() => onBookClick?.(bundle)}
          />
        ))}
      </div>

      {/* Follow-up Suggestions */}
      {suggestions.length > 0 && (
        <div className="ai-followup-section">
          <p className="ai-followup-label">Continue exploring:</p>
          <div className="ai-suggestions">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                className="ai-suggestion-chip"
                onClick={() => onSuggestionClick?.(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session Info */}
      {sessionId && (
        <div className="ai-session-info">
          <small>Session: {sessionId.slice(-8)}</small>
        </div>
      )}
    </div>
  );
};

export default AiResults;

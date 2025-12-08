// src/pages/search/AiModePanel.jsx
import React, { useState } from 'react';

const AiModePanel = ({ onPromptSubmit, conversationHistory = [] }) => {
  const [prompt, setPrompt] = useState('');
  const suggestions = [
    'Hotels under $300 in Paris next month',
    'Weekend trip ideas from SFO',
    'Family-friendly beach trip this summer',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    if (typeof onPromptSubmit === 'function') {
      onPromptSubmit(text);
    }
    setPrompt(''); // Clear input after submit
  };

  const handleChipClick = (text) => {
    if (typeof onPromptSubmit === 'function') {
      onPromptSubmit(text);
    }
    setPrompt(''); // Clear input after click
  };

  return (
    <div className="ai-panel">
      {/* Conversation History */}
      {conversationHistory.length > 0 && (
        <div className="ai-conversation-history">
          {conversationHistory.map((msg, idx) => (
            <div key={idx} className={`ai-message ai-message--${msg.role}`}>
              <div className="ai-message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="ai-message-content">
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="ai-prompt-row">
          <div className="ai-icon-circle">AI</div>
          <input
            type="text"
            className="ai-input"
            placeholder="Describe your ideal trip and let AI plan it…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit" className="ai-submit-button">
            →
          </button>
        </div>
        {conversationHistory.length === 0 && (
          <div className="ai-chips-row">
            {suggestions.map((text) => (
              <button
                key={text}
                type="button"
                className={`ai-chip ${prompt === text ? 'ai-chip--active' : ''}`}
                onClick={() => handleChipClick(text)}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
};

export default AiModePanel;
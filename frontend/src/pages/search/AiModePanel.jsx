// src/pages/search/AiModePanel.jsx
import React, { useState } from 'react';

const AiModePanel = ({ onPromptSubmit }) => {
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

    // Tell parent (HomeSearchPage) about the prompt
    if (typeof onPromptSubmit === 'function') {
      onPromptSubmit(text);
    }
  };

  const handleChipClick = (text) => {
    setPrompt(text);

    // Immediately trigger AI search for this chip text
    if (typeof onPromptSubmit === 'function') {
      onPromptSubmit(text);
    }
  };

  return (
    <div className="ai-panel">
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

        <div className="ai-chips-row">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              className={`ai-chip ${
                prompt === text ? 'ai-chip--active' : ''
              }`}
              onClick={() => handleChipClick(text)}
            >
              {text}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
};

export default AiModePanel;

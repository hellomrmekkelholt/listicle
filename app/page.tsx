"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './styles.css'; // Import a CSS file for styling

const Home: React.FC = () => {
  const [formData, setFormData] = useState({ subject: '', object: '' });
  const [responseParagraph, setResponseParagraph] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log("Form Data:"+JSON.stringify(formData));
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });
    const result = await response.json();
    setResponseParagraph(result.paragraph);
    setLoading(false);
  };

  return (
    <div className="container">
      <h1 className="title">Silly Listical Maker</h1>
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label htmlFor="subject">The Subject:</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            className="input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="object">The Object:</label>
          <input
            type="text"
            id="object"
            name="object"
            value={formData.object}
            onChange={handleChange}
            className="input"
          />
        </div>
        <button type="submit" disabled={loading} className="button">
          Submit
        </button>
      </form>
      {loading && <p className="loading">Loading...</p>}
      {responseParagraph && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} className="response">
          {responseParagraph}
        </ReactMarkdown>
      )}
    </div>
  );
};

export default Home;

// This file runs entirely on Vercel's secure backend servers.
// The browser will NEVER see this code or the API key inside it.

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Grab the key securely from Vercel's backend environment
  const API_KEY = process.env.VITE_GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  try {
    // Make the request to Google from the server, not the browser
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: req.body.contents
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Send the successful data back to your React frontend
    return res.status(200).json(data);
    
  } catch (error) {
    console.error("Backend Error:", error);
    return res.status(500).json({ error: 'Failed to communicate with Gemini API' });
  }
}
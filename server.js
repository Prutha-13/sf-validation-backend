const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));

// Login - redirect to Salesforce
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SF_CLIENT_ID,
    redirect_uri: process.env.SF_CALLBACK_URL,
  });
  res.redirect(`https://login.salesforce.com/services/oauth2/authorize?${params}`);
});

// OAuth callback - exchange code for token
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const response = await axios.post(
      'https://login.salesforce.com/services/oauth2/token', null,
      { params: {
          grant_type: 'authorization_code',
          client_id: process.env.SF_CLIENT_ID,
          client_secret: process.env.SF_CLIENT_SECRET,
          redirect_uri: process.env.SF_CALLBACK_URL,
          code,
      }}
    );
    const { access_token, instance_url } = response.data;
    res.redirect(`${process.env.FRONTEND_URL}?token=${access_token}&instance=${encodeURIComponent(instance_url)}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('OAuth failed');
  }
});

// Get all Account validation rules
app.get('/api/validation-rules', async (req, res) => {
  const { token, instance } = req.query;
  try {
    const response = await axios.get(
      `${instance}/services/data/v59.0/tooling/query/?q=SELECT+Id,ValidationName,Active,Description+FROM+ValidationRule+WHERE+EntityDefinition.QualifiedApiName='Account'`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(response.data.records);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// Toggle a single rule
app.post('/api/toggle-rule', async (req, res) => {
  const { token, instance, ruleId, active } = req.body;
  try {
    const getRes = await axios.get(
      `${instance}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const metadata = getRes.data.Metadata;
    metadata.active = active;
    await axios.patch(
      `${instance}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      { Metadata: metadata },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

// Toggle ALL rules
app.post('/api/toggle-all', async (req, res) => {
  const { token, instance, active } = req.body;
  try {
    const listRes = await axios.get(
      `${instance}/services/data/v59.0/tooling/query/?q=SELECT+Id+FROM+ValidationRule+WHERE+EntityDefinition.QualifiedApiName='Account'`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    for (const rule of listRes.data.records) {
      const getRes = await axios.get(
        `${instance}/services/data/v59.0/tooling/sobjects/ValidationRule/${rule.Id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const metadata = getRes.data.Metadata;
      metadata.active = active;
      await axios.patch(
        `${instance}/services/data/v59.0/tooling/sobjects/ValidationRule/${rule.Id}`,
        { Metadata: metadata },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to toggle all' });
  }
});

app.listen(process.env.PORT, () => console.log(`Backend running on port ${process.env.PORT}`));
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);

// Temporary Diagnostic Route to find allowed status values
app.get('/api/debug-status', async (req, res) => {
  const { data, error } = await require('./supabaseClient').from('applications').select('status').limit(10);
  if (error) return res.status(500).json(error);
  const uniqueStatuses = [...new Set(data.map(a => a.status))];
  res.json({ uniqueStatuses });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

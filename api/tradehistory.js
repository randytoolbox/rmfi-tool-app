const fs   = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  try {
    const file = path.join(process.cwd(), 'data', 'trade-history.json');
    if (!fs.existsSync(file)) {
      return res.status(200).json({ trades: [], summary: { totalTrades:0, wins:0, losses:0, winRate:0, totalPL:0 } });
    }
    res.status(200).json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

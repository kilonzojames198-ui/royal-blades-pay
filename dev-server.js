require('dotenv').config();
require('./api/index').listen(3001, () => console.log('API on http://localhost:3001'));

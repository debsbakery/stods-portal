const fs = require('fs');
const content = fs.readFileSync('./lib/logo-base64.ts', 'utf8');

// Find the data:image/png;base64, prefix and extract just the base64 part
const match = content.match(/data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)/);
if (!match) {
  console.log('Could not find base64 data');
  process.exit(1);
}

const base64 = match[1].replace(/[\r\n\s]/g, '');
console.log('Base64 length:', base64.length);

const buffer = Buffer.from(base64, 'base64');
fs.writeFileSync('./public/logo.png', buffer);
console.log('Done! Saved to public/logo.png - size:', buffer.length, 'bytes');

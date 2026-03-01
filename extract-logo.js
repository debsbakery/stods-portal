const fs = require('fs');
const content = fs.readFileSync('./lib/logo-base64.ts', 'utf8');
const match = content.match(/`([A-Za-z0-9+/=\r\n]+)`/);
if (!match) {
  const match2 = content.match(/"([A-Za-z0-9+/=\r\n]{100,})"/);
  if (!match2) { console.log('Could not find base64 string - check file format'); process.exit(1); }
  const base64 = match2[1].replace(/[\r\n]/g, '');
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync('./public/logo.png', buffer);
  console.log('Done (double-quote match)! Size:', buffer.length, 'bytes');
} else {
  const base64 = match[1].replace(/[\r\n]/g, '');
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync('./public/logo.png', buffer);
  console.log('Done (backtick match)! Size:', buffer.length, 'bytes');
}

'use client';

import { useState } from 'react';

export default function TestEmailPage() {
  const [status, setStatus] = useState('');

  const sendTestEmail = async () => {
    try {
      setStatus('Sending...');
      const response = await fetch('/api/test-email'); // Uses the test route we created earlier
      const data = await response.json();
      setStatus(data.success ? '✅ Email sent!' : '❌ Failed');
    } catch (error) {
      setStatus('❌ Error');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Test Email</h1>
      <button onClick={sendTestEmail}>Send Test Email</button>
      <p>{status}</p>
    </div>
  );
}
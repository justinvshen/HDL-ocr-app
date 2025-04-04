import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';

function App() {
  const [ocrResult, setOcrResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ccData, setCcData] = useState([]);
  const inputRef = useRef(null);

  // Initialize a Tesseract.js worker (only once)
  const workerRef = useRef(
    createWorker({
      logger: (m) => {
        // Optional: see progress in console
        // console.log(m);
      },
    })
  );

  // Simple regex to find currency-ish strings (e.g. $12.34, 12.34, 45, etc.)
  const moneyRegex = /\$?(\d+\.\d{1,2}|\d+)/gim;

  // Handler: open hidden <input> so user can pick or take a photo
  const handleStart = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  // Handler: once the user selects/takes an image
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setOcrResult(null);
    setCcData([]);

    // 1) Load Tesseract worker (one time only)
    const worker = workerRef.current;
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // 2) Convert file to data URL
    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = reader.result;

      // 3) Do OCR
      try {
        const { data } = await worker.recognize(imageData);
        const text = data.text;

        setOcrResult(text);

        // 4) Parse lines for credit card sales and tips
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

        let results = [];
        for (let line of lines) {
          const lower = line.toLowerCase();
          // If line references "credit", "card", "charge" => interpret it as a credit card sale line
          // If line references "tip" => interpret it as a tip line
          // We'll capture all money strings from that line
          if (lower.includes('credit') || lower.includes('card') || lower.includes('charge') || lower.includes('tip')) {
            const matches = line.match(moneyRegex);
            if (matches) {
              results.push({
                lineText: line,
                amounts: matches.map((m) => parseFloat(m.replace('$', ''))),
                isTipLine: lower.includes('tip'),
              });
            }
          }
        }

        // 5) Build row data from results
        let rowData = [];
        results.forEach((r) => {
          r.amounts.forEach((amt) => {
            rowData.push({
              type: r.isTipLine ? 'Tip' : 'Credit Sale',
              amount: amt.toFixed(2),
            });
          });
        });
        setCcData(rowData);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Compute totals
  const totalSales = ccData
    .filter((r) => r.type === 'Credit Sale')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  const totalTips = ccData
    .filter((r) => r.type === 'Tip')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  return (
    <div style={styles.container}>
      {/* Simple header bar */}
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>Hai Di Lao Tips</h1>
      </div>

      {/* Main content: "Start" button or results */}
      <div style={styles.content}>
        {!ocrResult && !isLoading && ccData.length === 0 && (
          <button style={styles.startButton} onClick={handleStart}>
            Start
          </button>
        )}

        {/* Hidden file input */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={inputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Loading indicator */}
        {isLoading && <p>Processing image, please wait...</p>}

        {/* Show table if we have ccData */}
        {ccData.length > 0 && (
          <div style={styles.tableWrapper}>
            <h2>Parsed Results</h2>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ccData.map((row, index) => (
                  <tr key={index}>
                    <td style={styles.td}>{row.type}</td>
                    <td style={styles.td}>${row.amount}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr>
                  <td style={styles.td}><strong>Total Sales</strong></td>
                  <td style={styles.td}><strong>${totalSales.toFixed(2)}</strong></td>
                </tr>
                <tr>
                  <td style={styles.td}><strong>Total Tips</strong></td>
                  <td style={styles.td}><strong>${totalTips.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline styles for simplicity
const styles = {
  container: {
    fontFamily: 'sans-serif',
    backgroundColor: '#fefefe',
    height: '100vh',
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#333',
    color: '#fff',
    padding: '1rem',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButton: {
    fontSize: '1rem',
    padding: '1rem 2rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#28a745',
    color: '#fff',
    cursor: 'pointer',
  },
  tableWrapper: {
    width: '80%',
    maxWidth: '600px',
    margin: '2rem auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1rem',
    boxShadow: '0px 2px 5px rgba(0,0,0,0.2)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    borderBottom: '2px solid #ccc',
    textAlign: 'left',
    padding: '0.5rem',
  },
  td: {
    borderBottom: '1px solid #eee',
    padding: '0.5rem',
  },
};

export default App;

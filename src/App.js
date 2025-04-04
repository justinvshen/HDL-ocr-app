import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';

function App() {
  const [ocrResult, setOcrResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ccData, setCcData] = useState([]);
  const [noDataFound, setNoDataFound] = useState(false);

  const inputRef = useRef(null);
  const workerRef = useRef(
    createWorker({
      // Remove or comment out logger to avoid DataCloneErrors
      // logger: (m) => console.log(m)
    })
  );

  const moneyRegex = /\$?(\d+\.\d{1,2}|\d+)/gim;

  // If user taps "Start," open hidden file input
  const handleStart = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  // Reset to initial state
  const handleTryAgain = () => {
    setNoDataFound(false);
    setOcrResult(null);
    setCcData([]);
    setIsLoading(false);
  };

  // File chosen => do OCR
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setOcrResult(null);
    setCcData([]);
    setNoDataFound(false);

    const worker = workerRef.current;
    try {
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

      // Convert file to data URL
    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = reader.result;
      try {
        const { data } = await worker.recognize(imageData);
          const text = data.text || '';
        setOcrResult(text);

          // Parse lines for credit card sales & tips
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

        let results = [];
        for (let line of lines) {
          const lower = line.toLowerCase();
            if (
              lower.includes('credit') ||
              lower.includes('card') ||
              lower.includes('charge') ||
              lower.includes('tip')
            ) {
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

          // Build row data
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

          // If nothing was found, set noDataFound to true
          if (rowData.length === 0) {
            setNoDataFound(true);
          }
      } catch (err) {
        console.error(err);
          setNoDataFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setNoDataFound(true);
      setIsLoading(false);
    }
  };

  // Calculate totals
  const totalSales = ccData
    .filter((r) => r.type === 'Credit Sale')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  const totalTips = ccData
    .filter((r) => r.type === 'Tip')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

  // -------------
  //   RENDER UI
  // -------------

  // If no data was found
  if (noDataFound && !isLoading && ccData.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1>Receipt OCR</h1>
        </div>
        <div style={styles.content}>
          <p>No receipts or tips detected. Please try again.</p>
          <button style={styles.startButton} onClick={handleTryAgain}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1>Receipt OCR</h1>
      </div>

      {/* Main Content */}
      <div style={styles.content}>
        {/* Show Start button if no data yet */}
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

        {/* Loading... */}
        {isLoading && <p>Processing image, please wait...</p>}

        {/* Show table if we have data */}
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

// Inline styles
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
    padding: '1rem'
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

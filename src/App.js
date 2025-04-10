import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

/* ----------  TESSERACT WORKER CONFIG  ---------- */
const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/'; // public files
const worker = createWorker({
  workerPath: `${CDN}worker.min.js`,
  corePath:   `${CDN}tesseract-core.wasm.js`,
  langPath:   `${CDN}lang/`,
  // logger: (m) => console.log(m),   // optional progress
});

export default function App() {
  const [isReady, setIsReady]   = useState(false);   // OCR engine loaded?
  const [isLoading, setLoading] = useState(false);   // OCR in progress?
  const [rows, setRows]         = useState([]);      // [{sale, tip}]
  const [error, setError]       = useState(null);    // null | string
  const inputRef                = useRef(null);

  /* ----------  INITIALISE WORKER ONCE  ---------- */
  useEffect(() => {
    (async () => {
      try {
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      setIsReady(true);
      } catch (err) {
        console.error('Tesseract failed to load', err);
        setError('OCR engine failed to load. Check your connection and refresh.');
      }
    })();
    return () => { worker.terminate(); };
  }, []);

  /* ----------  HELPERS  ---------- */
  const moneyToFloat = (s) => parseFloat(s.replace(/[$,]/g, '').trim() || '0');

  const extractSummaryLines = (text) => {
    // Look for "Total  US$ 12.34" and "Tip  US$ 3.00"
    const totalRegex = /total\s*us\$?\s*([\d,.]+\.\d{2})/gi;
    const tipRegex   = /tip\s*us\$?\s*([\d,.]+\.\d{2})/gi;

    const totals = [...text.matchAll(totalRegex)].map((m) => moneyToFloat(m[1]));
    const tips   = [...text.matchAll(tipRegex)].map((m) => moneyToFloat(m[1]));

    const n = Math.min(totals.length, tips.length);
    const pairs = [];
    for (let i = 0; i < n; i++) pairs.push({ sale: totals[i], tip: tips[i] });
    return pairs;
  };

  /* ----------  FILE HANDLER  ---------- */
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setRows([]); setError(null); setLoading(true);

    try {
      const dataURL = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
      });

      const { data } = await worker.recognize(dataURL);
      const pairs = extractSummaryLines(data.text || '');

      if (pairs.length === 0) {
        setError('No summary “Total / Tip” lines found – please try again.');
      } else {
        setRows(pairs);
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong – please try again.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = ''; // allow same file again
    }
  };

  /* ----------  UI ACTIONS  ---------- */
  const handleStart    = () => inputRef.current?.click();
  const handleTryAgain = () => { setRows([]); setError(null); };

  /* ----------  TOTALS  ---------- */
  const totalSales = rows.reduce((a, r) => a + r.sale, 0);
  const totalTips  = rows.reduce((a, r) => a + r.tip,  0);

  /* ----------  RENDER  ---------- */
  return (
    <div style={styles.container}>
      <header style={styles.header}><h1>HDL Tips</h1></header>

      <main style={styles.content}>
        {!isReady && !error && <p>Loading OCR engine…</p>}

        {isReady && rows.length === 0 && !isLoading && !error && (
          <button style={styles.btn} onClick={handleStart}>Start</button>
        )}

        {isLoading && <p>Processing image, please wait…</p>}

        {error && (
          <>
            <p>{error}</p>
            <button style={styles.btn} onClick={handleTryAgain}>Try Again</button>
          </>
        )}

        {rows.length > 0 && (
          <div style={styles.tableWrap}>
            <h2>Parsed Results</h2>
            <table style={styles.table}>
              <thead>
                <tr><th>Sale (US$)</th><th>Tip (US$)</th></tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i}>
                    <td>${r.sale.toFixed(2)}</td>
                    <td>${r.tip.toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{fontWeight:'bold'}}>
                  <td>${totalSales.toFixed(2)}</td>
                  <td>${totalTips.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <button style={{...styles.btn, marginTop:'1rem'}} onClick={handleTryAgain}>
              Scan Another Photo
            </button>
          </div>
        )}

        {/* hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{display:'none'}}
          onChange={handleFileChange}
        />
      </main>
    </div>
  );
}

/* ----------  STYLES  ---------- */
const styles = {
  container:{fontFamily:'sans-serif',height:'100vh',display:'flex',flexDirection:'column'},
  header:{background:'#333',color:'#fff',padding:'1rem',textAlign:'center'},
  content:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem'},
  btn:{padding:'1rem 2rem',border:'none',borderRadius:'8px',background:'#28a745',color:'#fff',fontSize:'1rem',cursor:'pointer'},
  tableWrap:{width:'90%',maxWidth:'600px',background:'#fff',padding:'1rem',borderRadius:'8px',
             boxShadow:'0 2px 5px rgba(0,0,0,.2)'},
  table:{width:'100%',borderCollapse:'collapse'},
};

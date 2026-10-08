const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileChip = document.getElementById('file-chip');
const fileNameDisplay = document.getElementById('file-name-display');
const startBtn = document.getElementById('start-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const statusPercent = document.getElementById('status-percent');
const downloadContainer = document.getElementById('download-container');
const downloadBtn = document.getElementById('download-btn');
const resultMetaText = document.getElementById('result-meta-text');

let selectedZipFile = null;
let finalOutputZipBlob = null;

const MONTH_MAP = {
  january: '01', jan: '01', february: '02', feb: '02',
  march: '03', mar: '03', april: '04', apr: '04',
  may: '05', june: '06', jun: '06', july: '07', jul: '07',
  august: '08', aug: '08', september: '09', sep: '09',
  october: '10', oct: '10', november: '11', nov: '11',
  december: '12', dec: '12'
};

// Drag & Drop Interactions
['dragenter', 'dragover'].forEach(evtName => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(evtName => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelection(e.target.files[0]);
  }
});

function handleFileSelection(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    alert('Please upload a valid .zip file.');
    return;
  }
  selectedZipFile = file;
  fileNameDisplay.textContent = file.name;
  fileChip.style.display = 'inline-flex';
  startBtn.disabled = false;
  downloadContainer.style.display = 'none';
}

function normalizeDate(rawStr, fallbackHeader) {
  if (!rawStr) rawStr = fallbackHeader || '';
  
  const m1 = rawStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m1) {
    const d = parseInt(m1[1], 10).toString().padStart(2, '0');
    const m = MONTH_MAP[m1[2].toLowerCase()] || '01';
    const y = m1[3];
    return { clean: `${y}${m}${d}`, display: `${parseInt(d, 10)} ${m1[2]} ${y}` };
  }

  const m2 = rawStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m2) {
    const y = m2[1];
    const m = parseInt(m2[2], 10).toString().padStart(2, '0');
    const d = parseInt(m2[3], 10).toString().padStart(2, '0');
    return { clean: `${y}${m}${d}`, display: `${y}/${m}/${d}` };
  }

  return { clean: "20260101", display: "2026/01/01" };
}

function cleanDiagnosis(raw) {
  const skipKeywords = ['house', 'g-a', 'fa-', 'gb/', 'w18/', 'fa2', 'fa3', 'code', 'chatra'];
  return raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !(skipKeywords.some(sk => l.toLowerCase().includes(sk)) && l.length < 15))
    .map(l => l.replace(/^\d{4}\/\d{1,2}\/\d{1,2}.*?:\s*/, ''))
    .join('\n');
}

// Client-side Image Compression (max 600px dimension, 60% JPEG Quality)
async function compressImageToJpegBlob(imageBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(imageBlob);
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      const maxDim = 600;
      if (Math.max(w, h) > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.6);
    };
    img.onerror = () => resolve(imageBlob);
  });
}

function updateProgress(percent, text) {
  progressBar.style.width = `${percent}%`;
  statusPercent.textContent = `${percent}%`;
  statusText.textContent = text;
}

startBtn.addEventListener('click', async () => {
  if (!selectedZipFile) return;

  startBtn.disabled = true;
  downloadContainer.style.display = 'none';
  progressContainer.style.display = 'block';
  updateProgress(5, 'Extracting ZIP archive...');

  try {
    const zip = await JSZip.loadAsync(selectedZipFile);
    let chatTxtContent = '';
    const photoMap = {};

    const zipFiles = Object.keys(zip.files);
    for (const filename of zipFiles) {
      const entry = zip.files[filename];
      if (entry.dir) continue;
      
      const lower = filename.toLowerCase();
      const baseName = filename.split('/').pop();

      if (lower.endsWith('.txt') && (lower.includes('post') || lower.includes('record') || lower.includes('對話'))) {
        chatTxtContent = await entry.async('string');
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
        photoMap[baseName] = entry;
      }
    }

    if (!chatTxtContent) {
      const candidate = zipFiles.find(f => f.toLowerCase().endsWith('.txt') && !zip.files[f].dir);
      if (candidate) chatTxtContent = await zip.files[candidate].async('string');
    }

    if (!chatTxtContent) {
      alert('Error: WhatsApp text log (.txt) not found in archive.');
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    updateProgress(20, 'Parsing clinical log messages...');

    const msgPattern = /(\d{4}\/\d{1,2}\/\d{1,2}\s+[上下]午\d{1,2}:\d{2}\s*-\s*[^:]+:\s*)/g;
    const parts = chatTxtContent.split(msgPattern);
    const pigRecords = [];
    let currentPig = null;
    const earTagRegex = /\b(LY\s*\d+|Y\s*\d+|L\s*\d+|D\s*\d+|DD\s*\d+|PORKER\s*\d+)\b/i;

    for (let i = 1; i < parts.length; i += 2) {
      const header = parts[i];
      const body = parts[i + 1] ? parts[i + 1].trim() : '';
      const foundImgs = Array.from(body.matchAll(/(IMG-\d{8}-WA\d+\.jpg)/g)).map(m => m[1]);
      const cleanBody = body.replace(/‎?IMG-\d{8}-WA\d+\.jpg\s*\(附件檔案\)/g, '').trim();
      const lines = cleanBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      let newEar = null;
      if (lines.length > 0) {
        for (const line of lines.slice(0, 3)) {
          const em = line.match(earTagRegex);
          if (em) {
            newEar = em[1].toUpperCase().replace(/\s+/g, '');
            break;
          }
        }
      }

      const isCase = ['post mortem', 'sudden death', 'died', 'clinical', 'abscess', 'ulcer', 'pleurisy', 'dystocia', 'hydronephrosis', 'splenomegaly']
        .some(k => cleanBody.toLowerCase().includes(k));

      if (newEar && isCase) {
        if (currentPig) pigRecords.push(currentPig);

        const hm = header.match(/(\d{4}\/\d{1,2}\/\d{1,2})/);
        const hDate = hm ? hm[1] : '2026/01/01';
        const dm = cleanBody.match(/(?:death|died)?\s*[:：]?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}\/\d{1,2}\/\d{1,2})/i);
        const rawD = dm ? dm[1] : hDate;
        const norm = normalizeDate(rawD, hDate);

        currentPig = {
          earTag: newEar,
          cleanDate: norm.clean,
          displayDate: norm.display,
          diagnosis: cleanDiagnosis(cleanBody),
          images: []
        };
      }

      if (currentPig && foundImgs.length > 0) {
        for (const img of foundImgs) {
          if (!currentPig.images.includes(img)) currentPig.images.push(img);
        }
      }
    }
    if (currentPig) pigRecords.push(currentPig);

    if (pigRecords.length === 0) {
      alert('Notice: No valid pig necropsy records could be identified.');
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    const outZip = new JSZip();
    const totalPigs = pigRecords.length;

    for (let idx = 0; idx < totalPigs; idx++) {
      const pig = pigRecords[idx];
      const percent = 20 + Math.round(((idx + 1) / totalPigs) * 70);
      updateProgress(percent, `Generating: ${pig.cleanDate}_${pig.earTag}.pdf (${idx + 1}/${totalPigs})`);

      const pdfDoc = await PDFLib.PDFDocument.create();
      let page = pdfDoc.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

      // Report Title
      page.drawText("Farm Post-Mortem and Image Record Report", {
        x: 40, y: height - 42, size: 14, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });

      // Information Table Card
      page.drawRectangle({
        x: 40, y: height - 88, width: width - 80, height: 36,
        color: PDFLib.rgb(0.96, 0.97, 0.98), borderColor: PDFLib.rgb(0.85, 0.88, 0.92), borderWidth: 0.5
      });
      page.drawText(`Sow Ear Tag: ${pig.earTag}`, { x: 50, y: height - 68, size: 9, font: fontBold });
      page.drawText(`Date of Death: ${pig.displayDate}`, { x: 260, y: height - 68, size: 9, font: fontRegular });
      page.drawText(`Total Lesion Images: ${pig.images.length} photos`, { x: 50, y: height - 81, size: 8, font: fontRegular });

      // Pathological Notes
      page.drawText("[ Primary Diagnosis & Pathological Notes ]", {
        x: 40, y: height - 108, size: 10, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });

      const diagLines = pig.diagnosis.split('\n').slice(0, 4);
      let curY = height - 123;
      for (const line of diagLines) {
        page.drawText(line.substring(0, 95), { x: 45, y: curY, size: 8, font: fontRegular, color: PDFLib.rgb(0.1, 0.1, 0.1) });
        curY -= 12;
      }

      page.drawText("[ Sequential Post-Mortem Lesion Images ]", {
        x: 40, y: curY - 5, size: 10, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });
      curY -= 15;

      // 2-Column Photo Grid
      pig.images.sort();
      const colW = 250;
      const rowH = 180;
      let colIdx = 0;

      for (const imgName of pig.images) {
        if (curY - rowH < 30) {
          page = pdfDoc.addPage([595.28, 841.89]);
          curY = height - 42;
          colIdx = 0;
        }

        const imgX = colIdx === 0 ? 40 : 305;
        page.drawText(`File: ${imgName}`, { x: imgX, y: curY - 10, size: 7, font: fontRegular });

        if (photoMap[imgName]) {
          try {
            const rawBlob = await photoMap[imgName].async('blob');
            const compressed = await compressImageToJpegBlob(rawBlob);
            const arrayBuffer = await compressed.arrayBuffer();
            const embeddedImg = await pdfDoc.embedJpg(arrayBuffer);
            page.drawImage(embeddedImg, {
              x: imgX, y: curY - rowH, width: colW, height: rowH - 15
            });
          } catch (err) {
            page.drawText("[Image Read Error]", { x: imgX, y: curY - 30, size: 8, font: fontRegular });
          }
        } else {
          page.drawText("[Image Missing]", { x: imgX, y: curY - 30, size: 8, font: fontRegular });
        }

        colIdx++;
        if (colIdx === 2) {
          colIdx = 0;
          curY -= rowH;
        }
      }

      const pdfBytes = await pdfDoc.save();
      outZip.file(`${pig.cleanDate}_${pig.earTag}.pdf`, pdfBytes);
    }

    updateProgress(96, 'Packaging into unified ZIP archive...');
    finalOutputZipBlob = await outZip.generateAsync({ type: 'blob' });
    
    updateProgress(100, 'Processing complete!');
    resultMetaText.textContent = `Successfully generated ${totalPigs} PDF reports in a single compressed package.`;
    downloadContainer.style.display = 'block';

  } catch (error) {
    console.error(error);
    alert('Execution error: ' + error.message);
    statusText.textContent = 'Execution Failed';
  } finally {
    startBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!finalOutputZipBlob) return;
  const url = URL.createObjectURL(finalOutputZipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'All_Generated_Pig_Reports.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
